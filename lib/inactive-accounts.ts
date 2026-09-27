import type { Prisma } from '@/prisma/client'
import { prisma } from './db'
import { apiLogger } from './logger'
import { RETENTION_DAYS } from './retention-periods'
import { neverCustomerWhere } from './cleanup-unverified'
import { sendInactiveAccountWarningEmail } from './email'
import { deleteUserAccount } from './account-deletion'
import { resolveRetentionEnforceOverride, type RetentionEnforceOverride } from './data-retention'

const log = apiLogger('inactive-accounts')

/**
 * Inactive registered accounts (#1130, decision 2026-09-27): an account nobody has used for
 * RETENTION_DAYS.inactiveAccounts (24 months) is deleted, and its owner is warned by email
 * RETENTION_DAYS.inactiveAccountWarning (30) days before. GDPR Art. 5(1)(e): an account
 * nobody uses has no purpose left to keep it for.
 *
 * Activity is `Users.lastActiveAt`: written on sign-in (lib/next-auth.ts events.signIn) and
 * at most every five minutes while a signed-in session is in use, so signing in once is
 * enough to keep an account, which is what the warning tells people.
 *
 * Never touched: guests (their own 3/90-day rule), bots, admins (their activity is in the
 * Control Panel, which does not write lastActiveAt), and any account that is or ever was a
 * customer – a running subscription, paid time left, a Stripe customer, a checkout record
 * or Premium ever granted – the same protection the unverified-account purge has
 * (neverCustomerWhere). An account without an email address cannot be warned, so it is
 * never deleted by this rule either; production had none on 2026-09-27.
 *
 * Idempotent the way the subscription notice is: a warning is claimed by moving
 * `inactivityWarningSentAt` from the value this run read to now in one conditional update,
 * and put back if the email fails. A deletion needs a warning sent after the last activity
 * and at least the warning period old, and the delete itself is guarded on lastActiveAt and
 * the warning being exactly what this run read, so a sign-in at any point keeps the account.
 *
 * Counted read-only on production on 2026-09-27: 0 accounts due a warning, 0 due deletion;
 * the oldest lastActiveAt of a registered human was 2025-12-18, so the first warning can
 * come on 2027-11-19 and the first deletion on 2027-12-19 at the earliest. Enforced by
 * default for that reason, and
 * RETENTION_ENFORCE=false puts it in report mode with the table rules.
 */

export const INACTIVE_ACCOUNTS_ENFORCE_BY_DEFAULT = true

const DAY_MS = 24 * 60 * 60 * 1000

/** Every account the rule may ever warn or delete, whatever its dates. */
export function inactiveAccountRuleWhere(now: Date = new Date()): Prisma.UsersWhereInput {
  return {
    AND: [
      { isGuest: false, bot: null, role: 'user', premiumFirstGrantedAt: null, email: { not: null } },
      neverCustomerWhere(now),
    ],
  }
}

export function inactivityCutoffs(now: Date): { warnCutoff: Date; deleteCutoff: Date } {
  return {
    deleteCutoff: new Date(now.getTime() - RETENTION_DAYS.inactiveAccounts * DAY_MS),
    warnCutoff: new Date(
      now.getTime() - (RETENTION_DAYS.inactiveAccounts - RETENTION_DAYS.inactiveAccountWarning) * DAY_MS
    ),
  }
}

/** The day the warning names: 24 months after the last activity, never sooner than the warning period. */
export function inactiveDeletionDate(lastActiveAt: Date, now: Date): Date {
  const byActivity = lastActiveAt.getTime() + RETENTION_DAYS.inactiveAccounts * DAY_MS
  const byWarning = now.getTime() + RETENTION_DAYS.inactiveAccountWarning * DAY_MS
  return new Date(Math.max(byActivity, byWarning))
}

type Candidate = {
  id: string
  email: string | null
  username: string | null
  lastActiveAt: Date
  inactivityWarningSentAt: Date | null
}

const CANDIDATE_SELECT = {
  id: true,
  email: true,
  username: true,
  lastActiveAt: true,
  inactivityWarningSentAt: true,
} as const

/** Not warned since the account was last active: no warning, or one older than the activity. */
function notWarnedSinceActivity(candidate: Candidate): boolean {
  return candidate.inactivityWarningSentAt === null || candidate.inactivityWarningSentAt < candidate.lastActiveAt
}

/** Warned after the last activity, and at least the warning period ago. */
function warnedLongEnoughAgo(candidate: Candidate, now: Date): boolean {
  const warnedAt = candidate.inactivityWarningSentAt
  if (!warnedAt || warnedAt <= candidate.lastActiveAt) return false
  return warnedAt.getTime() <= now.getTime() - RETENTION_DAYS.inactiveAccountWarning * DAY_MS
}

export interface InactiveAccountRunResult {
  enforced: boolean
  warnCutoff: string
  deleteCutoff: string
  /** Accounts due a warning when the run began. In report mode none is sent. */
  warnDue: number
  warned: number
  /** Warnings whose email did not go out; released for the next run. */
  warnFailed: number
  /** Accounts due deletion when the run began. In report mode none is deleted. */
  deleteDue: number
  deleted: number
  /** Deletions refused (avatar or subscription) or given up because the account changed. */
  deleteFailed: number
}

export interface InactiveAccountRunOptions {
  now?: Date
  override?: RetentionEnforceOverride
  sendEmail?: typeof sendInactiveAccountWarningEmail
  deleteAccount?: typeof deleteUserAccount
  /** Caps per run, so a backlog is worked off over several days inside the cron's time. */
  maxWarnings?: number
  maxDeletions?: number
  /** Stop starting new sends or deletions after this many ms. */
  deadlineMs?: number
}

export async function enforceInactiveAccounts(options: InactiveAccountRunOptions = {}): Promise<InactiveAccountRunResult> {
  const now = options.now ?? new Date()
  const override =
    options.override === undefined ? resolveRetentionEnforceOverride(process.env.RETENTION_ENFORCE) : options.override
  const enforced = override === 'enforce' ? true : override === 'report' ? false : INACTIVE_ACCOUNTS_ENFORCE_BY_DEFAULT
  const sendEmail = options.sendEmail ?? sendInactiveAccountWarningEmail
  const deleteAccount = options.deleteAccount ?? deleteUserAccount
  // Resend's plan allows 100 emails a day for the whole product (lib/email-send-guard.ts
  // keeps 80 of them for sign-up and reset mail), so a backlog of warnings drains slowly
  // rather than eating the day's budget. A late warning still gives the full 30 days.
  const maxWarnings = options.maxWarnings ?? 10
  const maxDeletions = options.maxDeletions ?? 25
  const startedAt = Date.now()
  const pastDeadline = () => options.deadlineMs !== undefined && Date.now() - startedAt > options.deadlineMs

  const { warnCutoff, deleteCutoff } = inactivityCutoffs(now)
  const rule = inactiveAccountRuleWhere(now)

  const result: InactiveAccountRunResult = {
    enforced,
    warnCutoff: warnCutoff.toISOString(),
    deleteCutoff: deleteCutoff.toISOString(),
    warnDue: 0,
    warned: 0,
    warnFailed: 0,
    deleteDue: 0,
    deleted: 0,
    deleteFailed: 0,
  }

  // Deletions first: an account warned 30 days ago must not be read as due another warning.
  const deleteCandidates: Candidate[] = await prisma.users.findMany({
    where: { AND: [rule, { lastActiveAt: { lt: deleteCutoff } }, { inactivityWarningSentAt: { not: null } }] },
    select: CANDIDATE_SELECT,
    orderBy: { lastActiveAt: 'asc' },
  })
  const dueForDeletion = deleteCandidates.filter((candidate) => warnedLongEnoughAgo(candidate, now))
  result.deleteDue = dueForDeletion.length

  if (enforced) {
    for (const candidate of dueForDeletion.slice(0, maxDeletions)) {
      if (pastDeadline()) break
      // The same rule once more, pinned to what this run read: a sign-in moves
      // lastActiveAt and a new warning moves inactivityWarningSentAt, and either keeps the
      // account.
      const guard: Prisma.UsersWhereInput = {
        AND: [
          rule,
          { lastActiveAt: candidate.lastActiveAt },
          { inactivityWarningSentAt: candidate.inactivityWarningSentAt },
        ],
      }
      try {
        const outcome = await deleteAccount(candidate.id, { reason: 'inactivity', guard })
        if (outcome.status === 'deleted') result.deleted += 1
        else {
          result.deleteFailed += 1
          log.warn('Inactive account not deleted', { userId: candidate.id, status: outcome.status })
        }
      } catch (error) {
        result.deleteFailed += 1
        log.error('Inactive account deletion failed', error as Error, { userId: candidate.id })
      }
    }
  }

  const warnCandidates: Candidate[] = await prisma.users.findMany({
    where: { AND: [rule, { lastActiveAt: { lt: warnCutoff } }] },
    select: CANDIDATE_SELECT,
    orderBy: { lastActiveAt: 'asc' },
  })
  const dueForWarning = warnCandidates.filter(notWarnedSinceActivity)
  result.warnDue = dueForWarning.length

  if (!enforced) return result

  for (const candidate of dueForWarning.slice(0, maxWarnings)) {
    if (pastDeadline()) break
    if (!candidate.email) continue

    // The claim. Matching both values this run read makes it a compare-and-set.
    const claimed = await prisma.users.updateMany({
      where: {
        id: candidate.id,
        lastActiveAt: candidate.lastActiveAt,
        inactivityWarningSentAt: candidate.inactivityWarningSentAt,
      },
      data: { inactivityWarningSentAt: now },
    })
    if (claimed.count !== 1) continue

    const sent = await sendEmail(candidate.email, {
      username: candidate.username,
      deleteOn: inactiveDeletionDate(candidate.lastActiveAt, now),
      idempotencyKey: `inactive-account-warning/${candidate.id}/${candidate.lastActiveAt.toISOString().slice(0, 10)}`,
    })

    if (sent.success) {
      result.warned += 1
      continue
    }

    result.warnFailed += 1
    // Release the claim, only if it is still ours, so the next run sends it. Deletion
    // counts 30 days from a warning that went out, never from one that did not.
    await prisma.users.updateMany({
      where: { id: candidate.id, inactivityWarningSentAt: now },
      data: { inactivityWarningSentAt: candidate.inactivityWarningSentAt },
    })
    log.warn('Inactive account warning not sent; released for the next run', {
      userId: candidate.id,
      error: sent.error,
    })
  }

  return result
}
