import type { Prisma } from '@/prisma/client'
import { prisma } from './db'
import { apiLogger } from './logger'
import { RETENTION_DAYS } from './retention-periods'
import { neverCustomerWhere } from './cleanup-unverified'
import { sendInactiveAccountWarningEmail } from './email'
import { emailLanguageFromLocale } from './email-language'
import { deleteUserAccount } from './account-deletion'
import { resolveRetentionEnforceOverride, type RetentionEnforceOverride } from './data-retention'
import { INACTIVITY_RULE_STARTS } from './terms-version'

const log = apiLogger('inactive-accounts')

/**
 * Stays false until the Terms section 11 email (lib/terms-change-notice.ts) has reached every
 * account holder at least 30 days before INACTIVITY_RULE_STARTS; before that day the rule
 * does nothing whatever this says.
 */
export const TERMS_ALLOW_INACTIVITY_DELETION = false

/**
 * Inactive registered accounts (#1130, decision 2026-09-27): an account nobody has used for
 * RETENTION_DAYS.inactiveAccounts (24 months) is deleted, and its owner is warned by email
 * RETENTION_DAYS.inactiveAccountWarning (30) days before. GDPR Art. 5(1)(e): an account
 * nobody uses has no purpose left to keep it for. Off until the Terms allow it (above).
 *
 * Activity is `Users.lastActiveAt`: written on sign-in (lib/next-auth.ts events.signIn) and
 * at most every five minutes while a signed-in session is in use, so signing in once is
 * enough to keep an account, which is what the warning tells people.
 *
 * Never touched: guests (their own 3/90-day rule), bots, admins (their activity is in the
 * Control Panel, which does not write lastActiveAt), suspended accounts (a suspension is a
 * moderation decision with its own route to an end, and deleting the account would end it
 * another way), and any account that is or ever was a customer – a running subscription,
 * paid time left, a Stripe customer, a checkout record or Premium ever granted – the same
 * protection the unverified-account purge has (neverCustomerWhere). An account without an
 * email address cannot be warned, so this rule never deletes one either; production had none
 * on 2026-09-27.
 *
 * Two markers make it safe to run twice and to crash at any point:
 * - `inactivityWarningSentAt` is the claim. A run moves it from the value it read to now in
 *   one conditional update before sending, and puts it back if Resend refuses the email. A
 *   claim that is a day old with nothing delivered (the function died mid-send) is taken
 *   again.
 * - `inactivityWarningDeliveredAt` is written only after Resend has accepted the email, and
 *   deletion requires it: later than the last activity and at least the warning period old.
 *   So a crash between the claim and the send can delay a warning but can never delete an
 *   account whose owner was not warned.
 *
 * The delete is guarded on lastActiveAt and the delivered warning being exactly what this run
 * read, checked when the account is read and again in the final delete statement. A sign-in
 * before the read keeps the account whole. One in the seconds between the read and the final
 * delete keeps the row but not what the deletion had already removed (lib/account-deletion.ts
 * lists it); nothing is billed either way, since a customer is never selected.
 *
 * Counted read-only on production on 2026-09-27: 0 accounts due a warning, 0 due deletion;
 * the oldest lastActiveAt of a registered human was 2025-12-18, so the first warning could
 * come on 2027-11-19 at the earliest. RETENTION_ENFORCE=false puts it in report mode with
 * the table rules.
 */

export const INACTIVE_ACCOUNTS_ENFORCE_BY_DEFAULT = true

const DAY_MS = 24 * 60 * 60 * 1000

/** A claim this old with no delivery behind it was left by a run that died mid-send. */
const STALE_CLAIM_MS = DAY_MS

/** Every account the rule may ever warn or delete, whatever its dates. */
export function inactiveAccountRuleWhere(now: Date = new Date()): Prisma.UsersWhereInput {
  return {
    AND: [
      {
        isGuest: false,
        bot: null,
        role: 'user',
        suspended: false,
        premiumFirstGrantedAt: null,
        email: { not: null },
      },
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
  language: string | null
  lastActiveAt: Date
  inactivityWarningSentAt: Date | null
  inactivityWarningDeliveredAt: Date | null
}

const CANDIDATE_SELECT = {
  id: true,
  email: true,
  username: true,
  language: true,
  lastActiveAt: true,
  inactivityWarningSentAt: true,
  inactivityWarningDeliveredAt: true,
} as const

/**
 * Due a warning: none delivered since the account was last active, and no claim in flight
 * (none since the activity, or one old enough to have been abandoned).
 */
function dueForWarning(candidate: Candidate, now: Date): boolean {
  const delivered = candidate.inactivityWarningDeliveredAt
  if (delivered && delivered >= candidate.lastActiveAt) return false
  const claimed = candidate.inactivityWarningSentAt
  if (!claimed || claimed < candidate.lastActiveAt) return true
  return claimed.getTime() <= now.getTime() - STALE_CLAIM_MS
}

/** Due deletion: a warning delivered after the last activity, at least the warning period ago. */
function warnedLongEnoughAgo(candidate: Candidate, now: Date): boolean {
  const delivered = candidate.inactivityWarningDeliveredAt
  if (!delivered || delivered <= candidate.lastActiveAt) return false
  return delivered.getTime() <= now.getTime() - RETENTION_DAYS.inactiveAccountWarning * DAY_MS
}

export interface InactiveAccountRunResult {
  /** False while the Terms do not allow the rule (TERMS_ALLOW_INACTIVITY_DELETION). */
  termsAllow: boolean
  /** Whether this run sent and deleted. Never true while termsAllow is false. */
  enforced: boolean
  warnCutoff: string
  deleteCutoff: string
  /** Accounts due a warning when the run began. When not enforced, none is sent. */
  warnDue: number
  warned: number
  /** Warnings Resend did not accept; released for the next run. */
  warnFailed: number
  /** Accounts due deletion when the run began. When not enforced, none is deleted. */
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
  /**
   * For tests only, to exercise the rule as it will run once the Terms allow it. Production
   * never passes it; the cron reads TERMS_ALLOW_INACTIVITY_DELETION.
   */
  termsAllowInactivityDeletion?: boolean
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
  const termsAllow =
    (options.termsAllowInactivityDeletion ?? TERMS_ALLOW_INACTIVITY_DELETION) &&
    now.getTime() >= Date.parse(`${INACTIVITY_RULE_STARTS}T00:00:00.000Z`)
  const wanted = override === 'enforce' ? true : override === 'report' ? false : INACTIVE_ACCOUNTS_ENFORCE_BY_DEFAULT
  // The Terms gate beats every override: RETENTION_ENFORCE=true cannot switch it on.
  const enforced = termsAllow && wanted
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
    termsAllow,
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
    where: { AND: [rule, { lastActiveAt: { lt: deleteCutoff } }, { inactivityWarningDeliveredAt: { not: null } }] },
    select: CANDIDATE_SELECT,
    orderBy: { lastActiveAt: 'asc' },
  })
  const dueForDeletion = deleteCandidates.filter((candidate) => warnedLongEnoughAgo(candidate, now))
  result.deleteDue = dueForDeletion.length

  if (enforced) {
    for (const candidate of dueForDeletion.slice(0, maxDeletions)) {
      if (pastDeadline()) break
      // The same rule once more, pinned to what this run read: a sign-in moves lastActiveAt
      // and a newer warning moves inactivityWarningDeliveredAt, and either keeps the account.
      const guard: Prisma.UsersWhereInput = {
        AND: [
          rule,
          { lastActiveAt: candidate.lastActiveAt },
          { inactivityWarningDeliveredAt: candidate.inactivityWarningDeliveredAt },
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
  const due = warnCandidates.filter((candidate) => dueForWarning(candidate, now))
  result.warnDue = due.length

  if (!enforced) return result

  for (const candidate of due.slice(0, maxWarnings)) {
    if (pastDeadline()) break
    if (!candidate.email) continue

    // The claim. Matching every value this run read makes it a compare-and-set.
    const claimed = await prisma.users.updateMany({
      where: {
        id: candidate.id,
        lastActiveAt: candidate.lastActiveAt,
        inactivityWarningSentAt: candidate.inactivityWarningSentAt,
        inactivityWarningDeliveredAt: candidate.inactivityWarningDeliveredAt,
      },
      data: { inactivityWarningSentAt: now },
    })
    if (claimed.count !== 1) continue

    const sent = await sendEmail(candidate.email, {
      username: candidate.username,
      language: emailLanguageFromLocale(candidate.language),
      deleteOn: inactiveDeletionDate(candidate.lastActiveAt, now),
      idempotencyKey: `inactive-account-warning/${candidate.id}/${candidate.lastActiveAt.toISOString().slice(0, 10)}`,
    })

    if (sent.success) {
      result.warned += 1
      // Only now does the 30-day clock start. If this write fails the claim goes stale and a
      // later run sends the warning again: a second email, never an unwarned deletion.
      try {
        await prisma.users.updateMany({
          where: { id: candidate.id, inactivityWarningSentAt: now },
          data: { inactivityWarningDeliveredAt: now },
        })
      } catch (error) {
        log.error('Inactive account warning sent but not recorded; it will be sent again', error as Error, {
          userId: candidate.id,
        })
      }
      continue
    }

    result.warnFailed += 1
    // Release the claim, only if it is still ours, so the next run sends it.
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
