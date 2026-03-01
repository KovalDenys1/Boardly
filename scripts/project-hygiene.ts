#!/usr/bin/env tsx

/**
 * GitHub Project (v2) hygiene automation
 *
 * Actions:
 * - Archive project items linked to merged/closed PRs
 * - Set closed issue cards to Done/Test-like status
 * - Keep open issue cards in Backlog/Planned/In progress lanes
 *
 * Usage:
 *   tsx scripts/project-hygiene.ts --dry-run
 *   tsx scripts/project-hygiene.ts --owner=KovalDenys1 --project=1
 */

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

type JsonRecord = Record<string, unknown>

interface ProjectOption {
  id: string
  name: string
}

interface ProjectStatusField {
  id: string
  name: string
  options: ProjectOption[]
}

interface ProjectItemStatusValue {
  optionId: string | null
  name: string | null
}

interface ProjectItemContentIssue {
  __typename: 'Issue'
  state: 'OPEN' | 'CLOSED'
  number: number
  title: string
  url: string
}

interface ProjectItemContentPullRequest {
  __typename: 'PullRequest'
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  merged: boolean
  number: number
  title: string
  url: string
}

interface ProjectItemNode {
  id: string
  isArchived: boolean
  fieldValueByName: ProjectItemStatusValue | null
  content: ProjectItemContentIssue | ProjectItemContentPullRequest | null
}

interface ProjectItemsQueryResult {
  node: {
    items: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
      nodes: Array<ProjectItemNode | null>
    }
  } | null
}

interface CliOptions {
  owner: string
  projectNumber: number
  dryRun: boolean
}

interface SummaryCounters {
  scanned: number
  archived: number
  issueStatusUpdated: number
  noContent: number
  alreadyCompliant: number
  skippedNoStatusField: number
  skippedNoMatchingOption: number
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function readArg(name: string): string | undefined {
  const flagPrefix = `--${name}=`
  const valueFlag = process.argv.find((arg) => arg.startsWith(flagPrefix))
  if (valueFlag) {
    return valueFlag.slice(flagPrefix.length)
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`)
  if (index !== -1) {
    const next = process.argv[index + 1]
    if (next && !next.startsWith('--')) {
      return next
    }
  }

  return undefined
}

function parseOptions(): CliOptions {
  const owner =
    readArg('owner') ||
    process.env.PROJECT_HYGIENE_OWNER ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    ''
  const projectRaw = readArg('project') || process.env.PROJECT_HYGIENE_PROJECT_NUMBER || ''
  const dryRunFlag = process.argv.includes('--dry-run')
  const dryRun = dryRunFlag || parseBoolean(process.env.PROJECT_HYGIENE_DRY_RUN, false)

  if (!owner) {
    throw new Error('Missing project owner. Set --owner or PROJECT_HYGIENE_OWNER.')
  }

  const projectNumber = Number.parseInt(projectRaw, 10)
  if (!Number.isFinite(projectNumber) || projectNumber <= 0) {
    throw new Error(
      'Missing or invalid project number. Set --project or PROJECT_HYGIENE_PROJECT_NUMBER.'
    )
  }

  return {
    owner,
    projectNumber,
    dryRun,
  }
}

function normalizeStatusName(input: string | null | undefined): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function buildOptionLookup(options: ProjectOption[]): Map<string, ProjectOption> {
  const map = new Map<string, ProjectOption>()
  for (const option of options) {
    const normalized = normalizeStatusName(option.name)
    if (normalized && !map.has(normalized)) {
      map.set(normalized, option)
    }
  }
  return map
}

function resolveStatusTargets(statusOptions: ProjectOption[]) {
  const normalizedOptionMap = buildOptionLookup(statusOptions)

  const openCandidates = ['backlog', 'planned', 'in progress']
  const closedCandidates = ['done test', 'done', 'test']

  const openOptions = openCandidates
    .map((candidate) => normalizedOptionMap.get(candidate))
    .filter((option): option is ProjectOption => Boolean(option))
  const openAllowedSet = new Set(openOptions.map((option) => normalizeStatusName(option.name)))

  const defaultOpenOption =
    normalizedOptionMap.get('backlog') ||
    normalizedOptionMap.get('planned') ||
    normalizedOptionMap.get('in progress') ||
    null

  const closedOption =
    normalizedOptionMap.get('done test') ||
    normalizedOptionMap.get('done') ||
    normalizedOptionMap.get('test') ||
    null

  return {
    openAllowedSet,
    defaultOpenOption,
    closedOption,
  }
}

async function callGithubGraphql<TData = JsonRecord>(token: string, query: string, variables?: JsonRecord): Promise<TData> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  const payload = (await response.json()) as { data?: TData; errors?: Array<{ message: string }> }
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed (${response.status})`)
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${payload.errors.map((error) => error.message).join('; ')}`)
  }

  if (!payload.data) {
    throw new Error('GitHub GraphQL response did not include data.')
  }

  return payload.data
}

async function resolveProjectAndStatusField(
  token: string,
  owner: string,
  projectNumber: number
): Promise<{ projectId: string; statusField: ProjectStatusField }> {
  const query = `
    query ResolveProject($owner: String!, $projectNumber: Int!) {
      user(login: $owner) {
        projectV2(number: $projectNumber) {
          id
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
      organization(login: $owner) {
        projectV2(number: $projectNumber) {
          id
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `

  const data = await callGithubGraphql<{
    user: {
      projectV2: {
        id: string
        fields: { nodes: Array<ProjectStatusField & { __typename: string } | null> }
      } | null
    } | null
    organization: {
      projectV2: {
        id: string
        fields: { nodes: Array<ProjectStatusField & { __typename: string } | null> }
      } | null
    } | null
  }>(token, query, { owner, projectNumber })

  const project = data.user?.projectV2 || data.organization?.projectV2
  if (!project) {
    throw new Error(`Project #${projectNumber} not found for owner "${owner}".`)
  }

  const statusFieldNode = project.fields.nodes.find((node) => {
    if (!node) return false
    return node.__typename === 'ProjectV2SingleSelectField' && normalizeStatusName(node.name) === 'status'
  })

  if (!statusFieldNode) {
    throw new Error('Project does not contain a single-select "Status" field.')
  }

  return {
    projectId: project.id,
    statusField: {
      id: statusFieldNode.id,
      name: statusFieldNode.name,
      options: statusFieldNode.options,
    },
  }
}

async function fetchProjectItems(token: string, projectId: string): Promise<ProjectItemNode[]> {
  const items: ProjectItemNode[] = []
  let hasNextPage = true
  let cursor: string | null = null

  const query = `
    query ProjectItems($projectId: ID!, $after: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              isArchived
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  name
                }
              }
              content {
                __typename
                ... on Issue {
                  state
                  number
                  title
                  url
                }
                ... on PullRequest {
                  state
                  merged
                  number
                  title
                  url
                }
              }
            }
          }
        }
      }
    }
  `

  while (hasNextPage) {
    const data: ProjectItemsQueryResult = await callGithubGraphql<ProjectItemsQueryResult>(
      token,
      query,
      {
      projectId,
      after: cursor,
      }
    )

    const page: NonNullable<ProjectItemsQueryResult['node']>['items'] | null = data.node?.items ?? null
    if (!page) {
      throw new Error('Failed to fetch project items (project node is missing).')
    }

    for (const node of page.nodes) {
      if (node) {
        items.push(node)
      }
    }

    hasNextPage = page.pageInfo.hasNextPage
    cursor = page.pageInfo.endCursor
  }

  return items
}

async function archiveProjectItem(token: string, projectId: string, itemId: string): Promise<void> {
  const mutation = `
    mutation ArchiveItem($projectId: ID!, $itemId: ID!) {
      archiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
        item {
          id
        }
      }
    }
  `

  await callGithubGraphql(token, mutation, {
    projectId,
    itemId,
  })
}

async function updateItemStatus(
  token: string,
  projectId: string,
  itemId: string,
  statusFieldId: string,
  optionId: string
): Promise<void> {
  const mutation = `
    mutation UpdateStatus(
      $projectId: ID!
      $itemId: ID!
      $statusFieldId: ID!
      $optionId: String!
    ) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $statusFieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `

  await callGithubGraphql(token, mutation, {
    projectId,
    itemId,
    statusFieldId,
    optionId,
  })
}

async function run() {
  const options = parseOptions()
  const token = process.env.PROJECT_HYGIENE_TOKEN || process.env.GITHUB_TOKEN

  if (!token) {
    throw new Error('Missing token. Set PROJECT_HYGIENE_TOKEN or GITHUB_TOKEN.')
  }

  console.log('[project-hygiene] Starting')
  console.log(
    `[project-hygiene] owner=${options.owner} project=${options.projectNumber} dryRun=${options.dryRun}`
  )

  const { projectId, statusField } = await resolveProjectAndStatusField(
    token,
    options.owner,
    options.projectNumber
  )
  const targets = resolveStatusTargets(statusField.options)
  const items = await fetchProjectItems(token, projectId)

  const summary: SummaryCounters = {
    scanned: 0,
    archived: 0,
    issueStatusUpdated: 0,
    noContent: 0,
    alreadyCompliant: 0,
    skippedNoStatusField: 0,
    skippedNoMatchingOption: 0,
  }

  for (const item of items) {
    summary.scanned += 1

    if (!item.content) {
      summary.noContent += 1
      continue
    }

    if (item.content.__typename === 'PullRequest') {
      const shouldArchive = item.content.merged || item.content.state === 'CLOSED'
      if (!shouldArchive || item.isArchived) {
        summary.alreadyCompliant += 1
        continue
      }

      if (options.dryRun) {
        console.log(
          `[dry-run] archive PR item #${item.content.number} (${item.content.title})`
        )
      } else {
        await archiveProjectItem(token, projectId, item.id)
      }
      summary.archived += 1
      continue
    }

    const currentStatus = normalizeStatusName(item.fieldValueByName?.name)

    if (item.content.state === 'CLOSED') {
      if (!statusField.id) {
        summary.skippedNoStatusField += 1
        continue
      }

      if (!targets.closedOption) {
        summary.skippedNoMatchingOption += 1
        continue
      }

      if (item.fieldValueByName?.optionId === targets.closedOption.id) {
        summary.alreadyCompliant += 1
        continue
      }

      if (options.dryRun) {
        console.log(
          `[dry-run] set closed issue #${item.content.number} -> ${targets.closedOption.name}`
        )
      } else {
        await updateItemStatus(token, projectId, item.id, statusField.id, targets.closedOption.id)
      }
      summary.issueStatusUpdated += 1
      continue
    }

    // Open issues
    if (!statusField.id) {
      summary.skippedNoStatusField += 1
      continue
    }

    if (!targets.defaultOpenOption) {
      summary.skippedNoMatchingOption += 1
      continue
    }

    if (currentStatus && targets.openAllowedSet.has(currentStatus)) {
      summary.alreadyCompliant += 1
      continue
    }

    if (item.fieldValueByName?.optionId === targets.defaultOpenOption.id) {
      summary.alreadyCompliant += 1
      continue
    }

    if (options.dryRun) {
      console.log(
        `[dry-run] set open issue #${item.content.number} -> ${targets.defaultOpenOption.name}`
      )
    } else {
      await updateItemStatus(token, projectId, item.id, statusField.id, targets.defaultOpenOption.id)
    }
    summary.issueStatusUpdated += 1
  }

  console.log('[project-hygiene] Completed')
  console.log(JSON.stringify(summary, null, 2))
}

run().catch((error) => {
  console.error('[project-hygiene] Failed', error)
  process.exit(1)
})
