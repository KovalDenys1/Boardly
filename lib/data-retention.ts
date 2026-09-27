import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { RETENTION_DAYS } from '@/lib/retention-periods'
import { deleteFeedbackDiscordCopies } from '@/lib/feedback-discord'
import { deleteReportDiscordCopies } from '@/lib/report-discord'
import {
  countGamesToPseudonymise,
  countLobbiesToPseudonymise,
  pseudonymiseGames,
  pseudonymiseLobbies,
} from '@/lib/game-pseudonymisation'

/**
 * Retention periods for the tables nothing else ever deleted (#1130, GDPR Art. 5(1)(e)).
 *
 * The numbers live in lib/retention-periods.ts, which /privacy also prints; this
 * module adds what each rule deletes and how. docs/PRIVACY-RETENTION.md restates them.
 *
 * Periods that already live elsewhere are not repeated here: unverified accounts
 * (7 days, lib/cleanup-unverified.ts), inactive registered accounts (24 months,
 * lib/inactive-accounts.ts), guests (3 / 90 days idle,
 * scripts/cleanup-old-guests.ts), replay snapshots (90 days, lib/cleanup-replays.ts)
 * and lobby chat (24 hours in Redis, lib/chat-history.ts).
 *
 * `enforceByDefault` is true only for a rule that touched zero production rows on the
 * day it shipped (counted read-only on 2026-09-24: every rule below matched 0 rows, the
 * oldest row in each table being younger than its period; the games and lobbies
 * pseudonymisation matched 0 again on 2026-09-27). A rule that would delete or rewrite
 * existing rows ships with it false, runs in report mode and only counts, until Denys
 * turns it on. RETENTION_ENFORCE overrides every rule at once: `false` makes the whole
 * run report-only, `true` enforces every rule.
 *
 * Most rules delete. `games` does not (decision 2026-09-27): a finished game past its
 * period is pseudonymised, its names, messages and drawings replaced and its scores
 * kept for statistics (lib/game-pseudonymisation.ts). `lobbies` does both: a lobby with
 * no game in it is deleted, and one whose games are all pseudonymised loses its name.
 */

export type RetentionRuleKey =
  | 'games'
  | 'lobbies'
  | 'lobbyParticipations'
  | 'operationalEvents'
  | 'feedback'
  | 'reports'
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
  /** True for a rule that rewrites rows instead of (or as well as) deleting them. */
  pseudonymises?: boolean
}

export const RETENTION_RULES: Readonly<Record<RetentionRuleKey, RetentionRule>> = {
  games: {
    key: 'games',
    table: 'Games',
    days: RETENTION_DAYS.games,
    measuredFrom: 'the end of the game (endedAt, else last update); finished, abandoned and cancelled games only',
    purpose:
      'Game history and statistics shown to the players. Past the period the game is pseudonymised, not deleted: names, messages and drawings go, scores and results stay for statistics, the leaderboard and achievements',
    enforceByDefault: true,
    pseudonymises: true,
  },
  lobbies: {
    key: 'lobbies',
    table: 'Lobbies',
    days: RETENTION_DAYS.lobbies,
    measuredFrom:
      'creation; inactive lobbies only. One with no game in it is deleted; one whose games are all pseudonymised gets a neutral name',
    purpose: 'Lobby name, code and creator for the games played in it',
    enforceByDefault: true,
    pseudonymises: true,
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
  reports: {
    key: 'reports',
    table: 'Reports',
    days: RETENTION_DAYS.reports,
    measuredFrom: 'the report; a reported drawing goes once no report points at it',
    purpose: 'Handling reports of unlawful or harmful content (#1172)',
    // A new table: it held no rows on the day the rule shipped.
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

/** A daily run pseudonymises at most this many games; a backlog drains over the next days. */
const MAX_GAMES_PSEUDONYMISED_PER_RUN = 500
/** And stops starting new batches after this long, so the maintenance cron answers in time. */
const GAMES_PSEUDONYMISE_DEADLINE_MS = 30_000

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
  /** Rows past the period that the rule would delete or rewrite. */
  count: () => Promise<number>
  remove: () => Promise<number>
  /** Rows rewritten instead of deleted, for a rule that pseudonymises. Runs after remove. */
  pseudonymise?: () => Promise<number>
}

function ruleOperations(key: RetentionRuleKey, cutoff: Date, now: Date): RuleOperations {
  switch (key) {
    case 'games': {
      // Pseudonymised, never deleted (decision 2026-09-27): Players rows, scores and
      // results stay for statistics, the leaderboard and achievements.
      return {
        count: () => countGamesToPseudonymise(cutoff),
        remove: async () => 0,
        pseudonymise: async () =>
          (
            await pseudonymiseGames({
              cutoff,
              now,
              maxGames: MAX_GAMES_PSEUDONYMISED_PER_RUN,
              deadlineMs: GAMES_PSEUDONYMISE_DEADLINE_MS,
            })
          ).pseudonymised,
      }
    }
    case 'lobbies': {
      // A lobby cascades its games, and games are no longer deleted, so only a lobby that
      // never held one is deleted. One that did keeps its code and loses its name once
      // every game in it has been pseudonymised (games run first, so the same run can).
      const where = { isActive: false, createdAt: { lt: cutoff }, games: { none: {} } }
      return {
        count: async () =>
          (await prisma.lobbies.count({ where })) + (await countLobbiesToPseudonymise(cutoff)),
        remove: async () => (await prisma.lobbies.deleteMany({ where })).count,
        pseudonymise: () => pseudonymiseLobbies(cutoff, now),
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
        remove: async () => {
          // The Discord copy goes with the row. A row whose copy Discord refused to
          // delete is kept, with its message id, for the next run to try again.
          const { failed } = await deleteFeedbackDiscordCopies(where)
          const removable = failed.length > 0 ? { ...where, id: { notIn: failed } } : where
          return (await prisma.feedback.deleteMany({ where: removable })).count
        },
      }
    }
    case 'reports': {
      const where = { createdAt: { lt: cutoff } }
      return {
        count: () => prisma.reports.count({ where }),
        remove: async () => {
          // As with feedback: the Discord notification goes with the row, and a row
          // whose notification Discord refused to delete is kept for the next run.
          const { failed } = await deleteReportDiscordCopies(where)
          const removable = failed.length > 0 ? { ...where, id: { notIn: failed } } : where
          const deleted = (await prisma.reports.deleteMany({ where: removable })).count
          // A reported drawing is shared by its reports, so it goes once the last of
          // them has. Only one older than the cutoff: a drawing is written just before
          // its first report, and a fresh one must not be taken from under it.
          await prisma.reportedDrawings.deleteMany({ where: { createdAt: { lt: cutoff }, reports: { none: {} } } })
          return deleted
        },
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
  /**
   * Rows past the period when the rule ran: in report mode what it would have deleted or
   * rewritten, when enforced what it did. In report mode nothing is changed.
   */
  matched: number
  deleted: number
  /** Present on a rule that pseudonymises: rows rewritten rather than deleted. */
  pseudonymised?: number
  error?: string
}

export type RetentionRunResult = Record<RetentionRuleKey, RetentionRuleResult>

const log = apiLogger('data-retention')

/**
 * Applies every retention rule once. Games run before lobbies so that a lobby whose
 * last game has just been pseudonymised can follow in the same run. One failing rule
 * does not stop the others; its error is reported in its own entry.
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
    const ops = ruleOperations(key, cutoff, now)
    const entry: RetentionRuleResult = {
      days: rule.days,
      cutoff: cutoff.toISOString(),
      enforced,
      matched: 0,
      deleted: 0,
      ...(rule.pseudonymises ? { pseudonymised: 0 } : {}),
    }

    try {
      if (enforced) {
        entry.deleted = await ops.remove()
        if (ops.pseudonymise) entry.pseudonymised = await ops.pseudonymise()
        entry.matched = entry.deleted + (entry.pseudonymised ?? 0)
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
