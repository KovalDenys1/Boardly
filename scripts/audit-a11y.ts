import { readFileSync } from 'fs'
import path from 'path'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Result as AxeResult } from 'axe-core'

/**
 * axe-core accessibility audit (#1171).
 *
 * forskrift om universell utforming av IKT-løsninger § 4 binds this private
 * site to WCAG 2.0 A/AA today (see DESIGN.md "Contrast" and CLAUDE.md's
 * "Plans, costs and accounts" section is not this — this is the legal one).
 * This script drives a headless, isolated Chromium — never the developer's
 * own Chrome (CLAUDE.md "Driving a browser on this Mac: the keychain will
 * stop you dead") — through the routes named in #1171's acceptance criteria
 * plus one bot game screen, and fails the run when axe reports a 'serious'
 * or 'critical' violation that is not in scripts/a11y-allowlist.json.
 *
 * Usage:
 *   npm run audit:a11y                                   # localhost:3000
 *   A11Y_BASE_URL=https://preview-x.vercel.app npm run audit:a11y
 *
 * Docs: docs/OPERATIONS.md "Accessibility audit (axe)" covers how to read a
 * report and the rule for extending the allowlist (brand-colour contrast
 * items only, never anything else).
 *
 * The bot-game route is reached the same way a guest player would: a real
 * guest session is minted through /api/auth/guest-session and Quick Play
 * creates + starts a Tic-Tac-Toe game against a bot, exactly like a visitor
 * clicking through the site. That endpoint is rate-limited to 5 requests per
 * 15 minutes per IP (lib/rate-limit.ts `auth` preset), and against
 * `boardly-dev` the limit is shared Upstash state across every agent on this
 * machine (CLAUDE.md) — running this script twice in quick succession from
 * the same machine can 429. That is a rate limit, not a broken endpoint:
 * retry after the window resets.
 */

type ImpactLevel = 'minor' | 'moderate' | 'serious' | 'critical'
const FAILING_IMPACTS = new Set<ImpactLevel>(['serious', 'critical'])

type AllowlistItem = {
  rule: string
  fgColor?: string
  bgColor?: string
  reason: string
}

type ViolationNode = {
  rule: string
  impact: ImpactLevel | null
  target: string
  fgColor?: string
  bgColor?: string
  allowlisted: boolean
  allowlistReason?: string
}

type RouteReport = {
  route: string
  nodes: ViolationNode[]
}

const repoRoot = process.cwd()
const allowlistPath = path.join(repoRoot, 'scripts', 'a11y-allowlist.json')
const baseUrl = (process.env.A11Y_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

const STATIC_ROUTES = [
  '/',
  '/lobby',
  '/auth/register',
  '/auth/login',
  '/premium',
  '/terms',
  '/privacy',
  '/withdrawal',
  '/rules',
]

const AXE_TAGS = ['wcag2a', 'wcag2aa']

function loadAllowlist(): AllowlistItem[] {
  const raw = JSON.parse(readFileSync(allowlistPath, 'utf8')) as { items: AllowlistItem[] }
  return raw.items
}

function matchesAllowlist(item: AllowlistItem, node: { rule: string; fgColor?: string; bgColor?: string }): boolean {
  if (item.rule !== node.rule) return false
  if (item.fgColor && item.fgColor.toLowerCase() !== (node.fgColor || '').toLowerCase()) return false
  if (item.bgColor && item.bgColor.toLowerCase() !== (node.bgColor || '').toLowerCase()) return false
  return true
}

function toViolationNodes(violations: AxeResult[], allowlist: AllowlistItem[]): ViolationNode[] {
  const nodes: ViolationNode[] = []
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const data = (node.any?.[0]?.data || node.all?.[0]?.data || node.none?.[0]?.data) as
        | { fgColor?: string; bgColor?: string }
        | undefined
      const entry = {
        rule: violation.id,
        fgColor: data?.fgColor,
        bgColor: data?.bgColor,
      }
      const allow = allowlist.find((item) => matchesAllowlist(item, entry))
      nodes.push({
        rule: violation.id,
        impact: (violation.impact as ImpactLevel) ?? null,
        target: node.target.join(' '),
        fgColor: data?.fgColor,
        bgColor: data?.bgColor,
        allowlisted: Boolean(allow),
        allowlistReason: allow?.reason,
      })
    }
  }
  return nodes
}

async function scanPage(page: Page, allowlist: AllowlistItem[]): Promise<ViolationNode[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  return toViolationNodes(results.violations, allowlist)
}

async function scanStaticRoute(browserContextFactory: () => Promise<BrowserContext>, route: string, allowlist: AllowlistItem[]): Promise<RouteReport> {
  const context = await browserContextFactory()
  const page = await context.newPage()
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)
  const nodes = await scanPage(page, allowlist)
  await context.close()
  return { route, nodes }
}

/**
 * Mints a guest session with a couple of retries — the auth rate limiter is
 * shared Upstash state on this machine (CLAUDE.md), so a transient 429 from
 * another agent's run is worth one retry before this script gives up.
 */
async function mintGuestSession(context: BrowserContext): Promise<{ guestId: string; guestName: string; guestToken: string } | null> {
  const guestName = `A11yAudit${Date.now().toString(36).slice(-8)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await context.request.post(`${baseUrl}/api/auth/guest-session`, {
      data: { guestName },
    })
    if (res.status() === 200) {
      const body = (await res.json()) as { guestId: string; guestName: string; guestToken: string }
      return body
    }
    if (res.status() === 429 && attempt < 2) {
      const body = await res.json().catch(() => ({}) as { retryAfter?: number })
      const waitMs = Math.min(30_000, ((body as { retryAfter?: number }).retryAfter ?? 10) * 1000)
      console.log(`  guest-session 429, retrying in ${Math.round(waitMs / 1000)}s (shared rate limit — CLAUDE.md)`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      continue
    }
    console.log(`  guest-session failed: ${res.status()} ${await res.text().catch(() => '')}`)
    return null
  }
  return null
}

/**
 * Reaches a live Tic-Tac-Toe-vs-bot board the same way a guest player would:
 * Quick Play from the homepage. Returns the violations found on that final
 * board screen, or null if the flow could not be driven (reported, not
 * thrown, so a flaky bot-game reach does not hide a real static-route
 * regression under it).
 */
async function scanBotGameRoute(browserContextFactory: () => Promise<BrowserContext>, allowlist: AllowlistItem[]): Promise<RouteReport | null> {
  const context = await browserContextFactory()
  const session = await mintGuestSession(context)
  if (!session) {
    await context.close()
    return null
  }

  await context.addInitScript(
    ([id, name, token]) => {
      localStorage.setItem('boardly_guest_id', id)
      localStorage.setItem('boardly_guest_name', name)
      localStorage.setItem('boardly_guest_token', token)
    },
    [session.guestId, session.guestName, session.guestToken]
  )

  const page = await context.newPage()
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(800)

    const skipButton = page.locator('button', { hasText: /Skip for now/i })
    if ((await skipButton.count()) > 0) {
      await skipButton.first().click()
      await page.waitForTimeout(300)
    }

    await page.locator('button', { hasText: /Quick Play/i }).first().click()
    await page.waitForTimeout(500)
    await page.locator('button', { hasText: /Tic.?Tac.?Toe/i }).first().click()
    await page.waitForURL(/\/lobby\//, { timeout: 15_000 })
    await page.waitForTimeout(4000)

    const startButton = page.locator('button', { hasText: /Start Game/i })
    if ((await startButton.count()) > 0) {
      await startButton.first().click()
    }
    await page.waitForSelector('.ttt-board', { timeout: 15_000 })
    await page.waitForTimeout(1500)

    const nodes = await scanPage(page, allowlist)
    return { route: '/lobby/<code> (Tic-Tac-Toe vs bot)', nodes }
  } catch (err) {
    console.log(`  could not reach the bot game screen: ${(err as Error).message}`)
    return null
  } finally {
    await context.close()
  }
}

function printReport(report: RouteReport): { total: number; failing: number } {
  const total = report.nodes.length
  const failing = report.nodes.filter((n) => !n.allowlisted && n.impact && FAILING_IMPACTS.has(n.impact)).length
  console.log(`\n${report.route}: ${total} violation node(s), ${failing} failing after allowlist`)
  for (const node of report.nodes) {
    const tag = node.allowlisted ? 'ALLOWLISTED' : node.impact && FAILING_IMPACTS.has(node.impact) ? 'FAIL' : 'ok'
    console.log(`  [${tag}] ${node.rule} (${node.impact ?? 'unknown'}) — ${node.target}`)
    if (node.allowlisted) console.log(`         ${node.allowlistReason}`)
  }
  return { total, failing }
}

async function main() {
  const allowlist = loadAllowlist()
  console.log(`axe accessibility audit against ${baseUrl}`)
  console.log(`Allowlist: ${allowlist.length} item(s) from scripts/a11y-allowlist.json\n`)

  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain'] })
  const newContext = () => browser.newContext({ viewport: { width: 1280, height: 900 } })

  let totalNodes = 0
  let totalFailing = 0
  const reports: RouteReport[] = []

  for (const route of STATIC_ROUTES) {
    const report = await scanStaticRoute(newContext, route, allowlist)
    reports.push(report)
    const { total, failing } = printReport(report)
    totalNodes += total
    totalFailing += failing
  }

  const gameReport = await scanBotGameRoute(newContext, allowlist)
  if (gameReport) {
    reports.push(gameReport)
    const { total, failing } = printReport(gameReport)
    totalNodes += total
    totalFailing += failing
  } else {
    console.log('\nbot game route: SKIPPED (could not reach it — see message above)')
    // Not reaching the game route is itself a failure: the acceptance
    // criteria names it explicitly, and a rate-limit skip must not read as
    // "clean".
    totalFailing += 1
  }

  await browser.close()

  console.log(`\n=== summary ===`)
  console.log(`Routes scanned: ${reports.length}${gameReport ? '' : ' (bot game route unreachable)'}`)
  console.log(`Total violation nodes: ${totalNodes}`)
  console.log(`Failing (serious/critical, outside allowlist): ${totalFailing}`)

  if (totalFailing > 0) {
    console.error(`\naudit:a11y FAILED — ${totalFailing} serious/critical violation(s) outside the allowlist.`)
    process.exitCode = 1
  } else {
    console.log('\naudit:a11y passed.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
