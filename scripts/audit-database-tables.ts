#!/usr/bin/env tsx
import { prisma } from '../lib/db'

type PolicyMode = 'required' | 'blocked-direct'

type ExpectedTable = {
  name: string
  domain: string
  purpose: string
  policyMode: PolicyMode
}

type CatalogRow = {
  tableName: string
  rlsEnabled: boolean
  rlsForced: boolean
  policyCount: bigint | number | string
  indexCount: bigint | number | string
  foreignKeyCount: bigint | number | string
  estimatedRows: number | string
  tableBytes: bigint | number | string
  totalBytes: bigint | number | string
}

type TimestampColumnRow = {
  tableName: string
  columnName: string
  dataType: string
}

type Issue = {
  severity: 'error' | 'warning' | 'info'
  message: string
}

const expectedTables: ExpectedTable[] = [
  {
    name: '_prisma_migrations',
    domain: 'schema',
    purpose: 'Prisma migration history',
    policyMode: 'required',
  },
  {
    name: 'Users',
    domain: 'identity',
    purpose: 'registered and guest identities, profile flags, roles',
    policyMode: 'required',
  },
  {
    name: 'Accounts',
    domain: 'auth',
    purpose: 'NextAuth provider accounts',
    policyMode: 'required',
  },
  {
    name: 'Sessions',
    domain: 'auth',
    purpose: 'NextAuth sessions',
    policyMode: 'required',
  },
  {
    name: 'VerificationTokens',
    domain: 'auth',
    purpose: 'NextAuth verification tokens',
    policyMode: 'required',
  },
  {
    name: 'PasswordResetTokens',
    domain: 'auth',
    purpose: 'password reset tokens',
    policyMode: 'required',
  },
  {
    name: 'EmailVerificationTokens',
    domain: 'auth',
    purpose: 'email verification tokens',
    policyMode: 'required',
  },
  {
    name: 'AccountPreferences',
    domain: 'identity',
    purpose: 'profile privacy, online status, onboarding markers',
    policyMode: 'blocked-direct',
  },
  {
    name: 'Bots',
    domain: 'gameplay',
    purpose: 'bot player metadata',
    policyMode: 'required',
  },
  {
    name: 'Lobbies',
    domain: 'gameplay',
    purpose: 'room setup, creator, spectator settings',
    policyMode: 'required',
  },
  {
    name: 'LobbyInvites',
    domain: 'social',
    purpose: 'invite funnel and conversion analytics',
    policyMode: 'required',
  },
  {
    name: 'Games',
    domain: 'gameplay',
    purpose: 'authoritative game state, lifecycle, match timing',
    policyMode: 'required',
  },
  {
    name: 'GameStateSnapshots',
    domain: 'gameplay',
    purpose: 'compressed replay snapshots',
    policyMode: 'required',
  },
  {
    name: 'Players',
    domain: 'gameplay',
    purpose: 'game participants, scores, placements',
    policyMode: 'required',
  },
  {
    name: 'FriendRequests',
    domain: 'social',
    purpose: 'pending and resolved friend requests',
    policyMode: 'required',
  },
  {
    name: 'Friendships',
    domain: 'social',
    purpose: 'accepted friend graph',
    policyMode: 'required',
  },
  {
    name: 'SpyLocations',
    domain: 'content',
    purpose: 'Guess the Spy location and role content',
    policyMode: 'required',
  },
  {
    name: 'OperationalEvents',
    domain: 'operations',
    purpose: 'reliability telemetry and KPI source events',
    policyMode: 'required',
  },
  {
    name: 'OperationalAlertStates',
    domain: 'operations',
    purpose: 'alert dedupe and open/resolved state',
    policyMode: 'required',
  },
  {
    name: 'NotificationPreferences',
    domain: 'notifications',
    purpose: 'user notification delivery preferences',
    policyMode: 'required',
  },
  {
    name: 'Notifications',
    domain: 'notifications',
    purpose: 'email and in-app notification queue/history',
    policyMode: 'required',
  },
  {
    name: 'AdminAuditLogs',
    domain: 'admin',
    purpose: 'admin action audit trail',
    policyMode: 'required',
  },
  {
    name: 'Feedback',
    domain: 'product',
    purpose: 'user feedback and issue reports',
    policyMode: 'blocked-direct',
  },
]

const authTimestampTables = new Set([
  'Accounts',
  'Sessions',
  'VerificationTokens',
  'PasswordResetTokens',
  'EmailVerificationTokens',
])

const args = new Set(process.argv.slice(2))
const jsonOnly = args.has('--json')
const exactCounts = args.has('--exact-counts')
const strict = args.has('--strict')
const showHelp = args.has('--help') || args.has('-h')

if (showHelp) {
  console.log('Database table audit')
  console.log('')
  console.log('Usage:')
  console.log('  npm run db:audit')
  console.log('  npm run db:audit -- --exact-counts')
  console.log('  npm run db:audit -- --json')
  console.log('')
  console.log('Options:')
  console.log('  --exact-counts  Run COUNT(*) per public table instead of planner estimates')
  console.log('  --json          Print machine-readable JSON only')
  console.log('  --strict        Exit non-zero on warnings as well as errors')
  console.log('  --help, -h      Show this help')
  process.exit(0)
}

function toNumber(value: bigint | number | string): number {
  if (typeof value === 'bigint') {
    return Number(value)
  }

  if (typeof value === 'string') {
    return Number(value)
  }

  return value
}

function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value === 'number') {
    return BigInt(Math.trunc(value))
  }

  return BigInt(value)
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function formatBytes(value: bigint): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let size = Number(value)

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function pad(value: string | number, width: number): string {
  const text = String(value)
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`
}

async function getCatalogRows(): Promise<CatalogRow[]> {
  return prisma.$queryRaw<CatalogRow[]>`
    SELECT
      c.relname AS "tableName",
      c.relrowsecurity AS "rlsEnabled",
      c.relforcerowsecurity AS "rlsForced",
      COALESCE(p.policy_count, 0)::bigint AS "policyCount",
      COALESCE(i.index_count, 0)::bigint AS "indexCount",
      COALESCE(fk.foreign_key_count, 0)::bigint AS "foreignKeyCount",
      GREATEST(c.reltuples, 0)::float AS "estimatedRows",
      pg_relation_size(c.oid)::bigint AS "tableBytes",
      pg_total_relation_size(c.oid)::bigint AS "totalBytes"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN (
      SELECT tablename, COUNT(*) AS policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
      GROUP BY tablename
    ) p ON p.tablename = c.relname
    LEFT JOIN (
      SELECT indrelid, COUNT(*) AS index_count
      FROM pg_index
      GROUP BY indrelid
    ) i ON i.indrelid = c.oid
    LEFT JOIN (
      SELECT conrelid, COUNT(*) AS foreign_key_count
      FROM pg_constraint
      WHERE contype = 'f'
      GROUP BY conrelid
    ) fk ON fk.conrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname;
  `
}

async function getTimestampColumns(): Promise<TimestampColumnRow[]> {
  return prisma.$queryRaw<TimestampColumnRow[]>`
    SELECT
      table_name AS "tableName",
      column_name AS "columnName",
      data_type AS "dataType"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
    ORDER BY table_name, column_name;
  `
}

async function getExactRowCount(tableName: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS count FROM public.${quoteIdentifier(tableName)}`
  )

  return toNumber(rows[0]?.count ?? 0)
}

async function main() {
  const expectedByName = new Map(expectedTables.map((table) => [table.name, table]))
  const catalogRows = await getCatalogRows()
  const timestampColumns = await getTimestampColumns()
  const catalogByName = new Map(catalogRows.map((table) => [table.tableName, table]))

  const exactRowCounts = new Map<string, number>()
  if (exactCounts) {
    for (const table of catalogRows) {
      exactRowCounts.set(table.tableName, await getExactRowCount(table.tableName))
    }
  }

  const issues: Issue[] = []

  for (const table of expectedTables) {
    const row = catalogByName.get(table.name)

    if (!row) {
      issues.push({
        severity: 'error',
        message: `Expected table is missing: ${table.name}`,
      })
      continue
    }

    if (!row.rlsEnabled) {
      issues.push({
        severity: 'error',
        message: `RLS is disabled on expected table: ${table.name}`,
      })
    }

    if (table.policyMode === 'required' && toNumber(row.policyCount) === 0) {
      issues.push({
        severity: 'error',
        message: `No RLS policies found on expected protected table: ${table.name}`,
      })
    }
  }

  for (const row of catalogRows) {
    if (!expectedByName.has(row.tableName)) {
      issues.push({
        severity: 'warning',
        message: `Unexpected public table is present: ${row.tableName}`,
      })
    }
  }

  for (const column of timestampColumns) {
    if (column.dataType !== 'timestamp without time zone') {
      continue
    }

    issues.push({
      severity: authTimestampTables.has(column.tableName) ? 'info' : 'warning',
      message: `${column.tableName}.${column.columnName} uses TIMESTAMP WITHOUT TIME ZONE`,
    })
  }

  const rows = catalogRows.map((row) => {
    const expected = expectedByName.get(row.tableName)
    return {
      tableName: row.tableName,
      domain: expected?.domain ?? 'unexpected',
      purpose: expected?.purpose ?? 'not in Boardly expected table inventory',
      rowCount: exactRowCounts.get(row.tableName) ?? Math.round(toNumber(row.estimatedRows)),
      rowCountMode: exactCounts ? 'exact' : 'estimated',
      rlsEnabled: row.rlsEnabled,
      rlsForced: row.rlsForced,
      policyCount: toNumber(row.policyCount),
      indexCount: toNumber(row.indexCount),
      foreignKeyCount: toNumber(row.foreignKeyCount),
      tableBytes: toNumber(row.tableBytes),
      totalBytes: toNumber(row.totalBytes),
      policyMode: expected?.policyMode ?? 'unknown',
    }
  })

  const result = {
    generatedAt: new Date().toISOString(),
    exactCounts,
    strict,
    tableCount: rows.length,
    expectedTableCount: expectedTables.length,
    issues,
    tables: rows,
  }

  if (jsonOnly) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Database table audit | generatedAt=${result.generatedAt}`)
    console.log(`Counts: ${exactCounts ? 'exact COUNT(*)' : 'planner estimates'}\n`)
    console.log(
      [
        pad('Table', 29),
        pad('Domain', 15),
        pad('Rows', 10),
        pad('Total', 9),
        pad('RLS', 4),
        pad('Policies', 8),
        pad('Indexes', 7),
        'Purpose',
      ].join('  ')
    )
    console.log('-'.repeat(126))

    for (const row of rows) {
      console.log(
        [
          pad(row.tableName, 29),
          pad(row.domain, 15),
          pad(row.rowCount, 10),
          pad(formatBytes(toBigInt(row.totalBytes)), 9),
          pad(row.rlsEnabled ? 'yes' : 'no', 4),
          pad(row.policyCount, 8),
          pad(row.indexCount, 7),
          row.purpose,
        ].join('  ')
      )
    }

    console.log('')
    if (issues.length === 0) {
      console.log('No database table audit issues found.')
    } else {
      console.log('Audit issues:')
      for (const issue of issues) {
        console.log(`- ${issue.severity.toUpperCase()}: ${issue.message}`)
      }
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error')
  const hasWarnings = issues.some((issue) => issue.severity === 'warning')
  if (hasErrors || (strict && hasWarnings)) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error('Database table audit failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
