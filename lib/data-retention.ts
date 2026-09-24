import { GameStatus } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { RETENTION_DAYS } from '@/lib/retention-periods'

/**
 * Retention periods for the tables nothing else ever deleted (#1130, GDPR Art. 5(1)(e)).
 *
 * The numbers live in lib/retention-periods.ts, which /privacy also prints; this
 * module adds what each rule deletes and how. docs/PRIVACY-RETENTION.md restates them.
 *
 * Periods that already live elsewhere are not repeated here: unverified accounts
 * (7 days, lib/cleanup-unverified.ts), guests (3 / 90 days idle,
 * scripts/cleanup-old-guests.ts), replay snapshots (90 days, lib/cleanup-replays.ts)
 * and lobby chat (24 hours in Redis, lib/chat-history.ts).
 *
 * `enforceByDefault` is true only for a rule that deleted zero production rows on the
 * day it shipped (counted read-only on 2026-09-24: every rule below matched 0 rows, the
 * oldest row in each table being younger than its period). A rule that would delete
 * existing rows ships with it false, runs in report mode and only counts, until Denys
 * turns it on. RETENTION_ENFORCE overrides every rule at once: `false` makes the whole
 * run report-only, `true` enforces every rule.
 */

export type RetentionRuleKey =
  | 'games'
  | 'lobbies'
  | 'lobbyParticipations'
  | 'operationalEvents'
  | 'feedback'
  | 'notifications'
  | 'adminAuditLogs'

export interface RetentionRule {
  key: RetentionRuleKey
  /** Table name as it appears in the database. */
  table: string
  days: number
  /** What the clock starts from, in words, for the report and the docs. */
  measuredFrom: string
  purpose: string
  enforceByDefault: boolean
}

export const RETENTION_RULES: Readonly<Record<RetentionRuleKey, RetentionRule>> = {
  games: {
    key: 'games',
    table: 'Games',
    days: RETENTION_DAYS.games,
    measuredFrom: 'the end of the game (endedAt, else last update); finished, abandoned and cancelled games only',
    purpose: 'Game history and statistics shown to the players',
    enforceByDefault: true,
  },
  lobbies: {
    key: 'lobbies',
    table: 'Lobbies',
    days: RETENTION_DAYS.lobbies,
    measuredFrom: 'creation; inactive lobbies with no game left in them only',
    purpose: 'Lobby name, code and creator for the games played in it',
    enforceByDefault: true,
  },
  lobbyParticipations: {
    key: 'lobbyParticipations',
    table: 'LobbyParticipations',
    days: RETENTION_DAYS.lobbyParticipations,
    measuredFrom: 'joining the lobby',
    purpose: 'Pseudonymous join counts (salted hash, no id or name) for year-over-year product analytics',
    enforceByDefault: true,
  },
  operationalEvents: {
    key: 'operationalEvents',
    table: 'OperationalEvents',
    days: RETENTION_DAYS.operationalEvents,
    measuredFrom: 'the event (occurredAt)',
    purpose: 'Reliability monitoring and alerting',
    enforceByDefault: true,
  },
  feedback: {
    key: 'feedback',
    table: 'Feedback',
    days: RETENTION_DAYS.feedback,
    measuredFrom: 'submission',
    purpose: 'Answering and acting on feedback and bug reports',
    enforceByDefault: true,
  },
  notifications: {
    key: 'notifications',
    table: 'Notifications',
    days: RETENTION_DAYS.notifications,
    measuredFrom: 'creation',
    purpose: 'In-app notification inbox and email/push delivery de-duplication',
    enforceByDefault: true,
  },
  adminAuditLogs: {
    key: 'adminAuditLogs',
    table: 'AdminAuditLogs',
    days: RETENTION_DAYS.adminAuditLogs,
    measuredFrom: 'the admin action',
    purpose: 'Accountability for actions taken in the Control Panel (bans, refunds, edits)',
    enforceByDefault: true,
  },
}

export const RETENTION_RULE_KEYS = Object.keys(RETENTION_RULES) as RetentionRuleKey[]

const TERMINAL_GAME_STATUSES = [GameStatus.finished, GameStatus.abandoned, GameStatus.cancelled]

export type RetentionEnforceOverride = 'enforce' | 'report' | null

export function resolveRetentionEnforceOverride(raw: string | undefined): RetentionEnforceOverride {
  const value = raw?.trim().toLowerCase()
  if (value === 'true' || value === '1') return 'enforce'
  if (value === 'false' || value === '0') return 'report'
  return null
}

export function isRuleEnforced(rule: RetentionRule, override: RetentionEnforceOverride): boolean {
  if (override === 'enforce') return true
  if (override === 'report') return false
  return rule.enforceByDefault
}

export function retentionCutoff(rule: RetentionRule, now: Date): Date {
  return new Date(now.getTime() - rule.days * 24 * 60 * 60 * 1000)
}

interface RuleOperations {
  count: () => Promise<number>
  remove: () => Promise<number>
}

function ruleOperations(key: RetentionRuleKey, cutoff: Date): RuleOperations {
  switch (key) {
    case 'games': {
      const where = {
        status: { in: TERMINAL_GAME_STATUSES },
        OR: [
          { endedAt: { lt: cutoff } },
          { endedAt: null, updatedAt: { lt: cutoff } },
        ],
      }
      return {
        count: () => prisma.games.count({ where }),
        // Players and GameStateSnapshots cascade with the game.
        remove: async () => (await prisma.games.deleteMany({ where })).count,
      }
    }
    case 'lobbies': {
      // A lobby cascades its games, so one that still holds a game (a newer rematch, or
      // a game the games rule has not reached) is kept until the games rule empties it.
      const where = { isActive: false, createdAt: { lt: cutoff }, games: { none: {} } }
      return {
        count: () => prisma.lobbies.count({ where }),
        remove: async () => (await prisma.lobbies.deleteMany({ where })).count,
      }
    }
    case 'lobbyParticipations': {
      const where = { joinedAt: { lt: cutoff } }
      return {
        count: () => prisma.lobbyParticipations.count({ where }),
        remove: async () => (await prisma.lobbyParticipations.deleteMany({ where })).count,
      }
    }
    case 'operationalEvents': {
      const where = { occurredAt: { lt: cutoff } }
      return {
        count: () => prisma.operationalEvents.count({ where }),
        remove: async () => (await prisma.operationalEvents.deleteMany({ where })).count,
      }
    }
    case 'feedback': {
      const where = { createdAt: { lt: cutoff } }
      return {
        count: () => prisma.feedback.count({ where }),
        remove: async () => (await prisma.feedback.deleteMany({ where })).count,
      }
    }
    case 'notifications': {
      const where = { createdAt: { lt: cutoff } }
      return {
        count: () => prisma.notifications.count({ where }),
        remove: async () => (await prisma.notifications.deleteMany({ where })).count,
      }
    }
    case 'adminAuditLogs': {
      const where = { createdAt: { lt: cutoff } }
      return {
        count: () => prisma.adminAuditLogs.count({ where }),
        remove: async () => (await prisma.adminAuditLogs.deleteMany({ where })).count,
      }
    }
  }
}

export interface RetentionRuleResult {
  days: number
  cutoff: string
  enforced: boolean
  /** Rows past the period when the rule ran. In report mode nothing is deleted. */
  matched: number
  deleted: number
  error?: string
}

export type RetentionRunResult = Record<RetentionRuleKey, RetentionRuleResult>

const log = apiLogger('data-retention')

/**
 * Applies every retention rule once. Games run before lobbies so that a lobby whose
 * last game has just aged out can go in the same run. One failing rule does not stop
 * the others; its error is reported in its own entry.
 */
export async function enforceRetention(options: {
  now?: Date
  override?: RetentionEnforceOverride
} = {}): Promise<RetentionRunResult> {
  const now = options.now ?? new Date()
  const override =
    options.override === undefined
      ? resolveRetentionEnforceOverride(process.env.RETENTION_ENFORCE)
      : options.override

  const result = {} as RetentionRunResult

  for (const key of RETENTION_RULE_KEYS) {
    const rule = RETENTION_RULES[key]
    const cutoff = retentionCutoff(rule, now)
    const enforced = isRuleEnforced(rule, override)
    const ops = ruleOperations(key, cutoff)
    const entry: RetentionRuleResult = {
      days: rule.days,
      cutoff: cutoff.toISOString(),
      enforced,
      matched: 0,
      deleted: 0,
    }

    try {
      if (enforced) {
        entry.deleted = await ops.remove()
        entry.matched = entry.deleted
      } else {
        entry.matched = await ops.count()
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message.slice(0, 200) : 'unknown'
      log.error(`Retention rule ${key} failed`, error as Error)
    }

    result[key] = entry
  }

  return result
}
