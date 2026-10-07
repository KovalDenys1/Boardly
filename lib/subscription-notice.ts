import type Stripe from 'stripe'
import { prisma } from './db'
import { sendSubscriptionNoticeEmail, type SubscriptionNoticeDetails } from './email'
import { emailLanguageFromLocale } from './email-language'
import { apiLogger } from './logger'
import type { PremiumPlan } from './premium-plans'
import { getStripe } from './stripe'

const log = apiLogger('subscription-notice')

/**
 * The running-subscription notice (#1165).
 *
 * digitalytelsesloven § 33 fourth paragraph (LOV-2022-06-17-56): "Ved løpende
 * levering av digitale ytelser skal leverandøren minst en gang hver sjette måned
 * sende forbrukeren et varsel om at avtalen løper, og opplyse forbrukeren om
 * adgangen til å si opp avtalen etter første til tredje ledd. Unnlater
 * leverandøren å sende slikt varsel, kan forbrukeren kostnadsfritt si opp
 * avtalen med virkning fra det tidspunktet varselet senest skulle ha vært sendt."
 *
 * Link's renewal emails under Stripe Managed Payments do not meet it (the
 * reasoning and the source are in docs/OPERATIONS.md, "Runbook: running-subscription
 * notice"), so this job sends our own: every running subscription gets one no
 * later than SUBSCRIPTION_NOTICE_INTERVAL_DAYS after it started, and again no
 * later than that after the previous one.
 */

/**
 * Six calendar months are 181 to 184 days. A notice is due 170 days after the
 * subscription started or after the previous notice, so a daily job that fails
 * for up to eleven days in a row still lands inside every six-month window.
 */
export const SUBSCRIPTION_NOTICE_INTERVAL_DAYS = 170

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The statuses of a contract that is still running. `past_due` is one whose
 * renewal payment is being retried: the contract has not ended, so the consumer
 * still has to hear how to end it. Everything else (canceled, incomplete,
 * incomplete_expired, unpaid, paused) is either over or never started.
 */
const RUNNING_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set(['active', 'trialing', 'past_due'])

export type SubscriptionNoticeSummary = {
  candidates: number
  sent: number
  notDue: number
  /** Ended, ending (cancel_at_period_end or cancel_at set), or not a running status. */
  notRunning: number
  /** Stripe answered "no such subscription": skipped quietly, see markMissing. */
  missing: number
  /** A Stripe read or an email that did not work; retried the next day. */
  failed: number
}

/**
 * Stripe's answer for an id it does not have. A test-mode id read with a live
 * key (or the reverse) gets the same code with "a similar object exists in test
 * mode" in the message; that is a key or data mix-up to fix, not a subscription
 * that ended, so it stays a failure and raises the alert.
 */
function isMissingSubscription(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code !== 'resource_missing') return false
  return !(typeof message === 'string' && /exists in (test|live) mode/i.test(message))
}

type Candidate = {
  id: string
  email: string | null
  username: string | null
  language: string | null
  stripeSubscriptionId: string | null
  lastSubscriptionNoticeAt: Date | null
  missingStripeSubscriptionId: string | null
  purchaseConsents: { stripeSubscriptionId: string | null; consentReceivedAt: Date }[]
}

export type SubscriptionNoticeDeps = {
  now?: Date
  retrieveSubscription?: (id: string) => Promise<Stripe.Subscription>
  sendEmail?: typeof sendSubscriptionNoticeEmail
  /** Stop starting new sends after this many ms, so the route answers inside maxDuration. */
  deadlineMs?: number
}

/** When a notice is due: INTERVAL days after the later of the start and the previous notice. */
export function noticeDueAt(start: Date, lastNoticeAt: Date | null): Date {
  const anchor = lastNoticeAt && lastNoticeAt > start ? lastNoticeAt : start
  return new Date(anchor.getTime() + SUBSCRIPTION_NOTICE_INTERVAL_DAYS * DAY_MS)
}

/**
 * The start of the current subscription as our own records know it: the first
 * checkout consent recorded for that subscription id (#1164). Null for a
 * subscription bought before PurchaseConsents existed; Stripe's start_date then
 * decides.
 */
function recordedStart(candidate: Candidate): Date | null {
  const times = candidate.purchaseConsents
    .filter((consent) => consent.stripeSubscriptionId === candidate.stripeSubscriptionId)
    .map((consent) => consent.consentReceivedAt.getTime())
  return times.length > 0 ? new Date(Math.min(...times)) : null
}

function planOf(subscription: Stripe.Subscription): PremiumPlan {
  return subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly'
}

function noticeDetails(candidate: Candidate, subscription: Stripe.Subscription): SubscriptionNoticeDetails {
  const item = subscription.items.data[0]
  const periodEnd = item?.current_period_end
  return {
    username: candidate.username,
    language: emailLanguageFromLocale(candidate.language),
    plan: planOf(subscription),
    unitAmount: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? null,
    renewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
  }
}

/**
 * Sends every notice that is due, at most once each.
 *
 * Idempotent by construction: a notice is claimed by moving
 * `Users.lastSubscriptionNoticeAt` from the value this run read to `now` in one
 * conditional update, so two overlapping runs cannot both send it, and a send
 * that fails puts the old value back so tomorrow's run tries again. The Resend
 * idempotency key is per user and per due date, so a retried request inside one
 * run cannot deliver twice either.
 */
export async function sendDueSubscriptionNotices(deps: SubscriptionNoticeDeps = {}): Promise<SubscriptionNoticeSummary> {
  const now = deps.now ?? new Date()
  const retrieveSubscription = deps.retrieveSubscription ?? ((id: string) => getStripe().subscriptions.retrieve(id))
  const sendEmail = deps.sendEmail ?? sendSubscriptionNoticeEmail
  const startedAt = Date.now()
  const cutoff = new Date(now.getTime() - SUBSCRIPTION_NOTICE_INTERVAL_DAYS * DAY_MS)

  // Every subscription the webhook has not marked as ending, whose last notice (if
  // any) is old enough. premiumUntil is deliberately not a filter: the webhook
  // nulls it for a past_due subscription, which is still a running contract.
  const candidates: Candidate[] = await prisma.users.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      premiumCancelAtPeriod: false,
      email: { not: null },
      OR: [{ lastSubscriptionNoticeAt: null }, { lastSubscriptionNoticeAt: { lte: cutoff } }],
    },
    select: {
      id: true,
      email: true,
      username: true,
      language: true,
      stripeSubscriptionId: true,
      lastSubscriptionNoticeAt: true,
      missingStripeSubscriptionId: true,
      purchaseConsents: { select: { stripeSubscriptionId: true, consentReceivedAt: true } },
    },
    orderBy: { id: 'asc' },
  })

  const summary: SubscriptionNoticeSummary = {
    candidates: candidates.length,
    sent: 0,
    notDue: 0,
    notRunning: 0,
    missing: 0,
    failed: 0,
  }

  for (const candidate of candidates) {
    if (deps.deadlineMs !== undefined && Date.now() - startedAt > deps.deadlineMs) break
    if (!candidate.email || !candidate.stripeSubscriptionId) continue

    // Already known to be gone from Stripe: no call, no log, until the webhook
    // stores another subscription id for this user.
    if (candidate.missingStripeSubscriptionId === candidate.stripeSubscriptionId) {
      summary.missing += 1
      continue
    }

    // Our own record of the start answers most "not yet" cases without asking Stripe.
    const known = recordedStart(candidate)
    if (known && noticeDueAt(known, candidate.lastSubscriptionNoticeAt) > now) {
      summary.notDue += 1
      continue
    }

    let subscription: Stripe.Subscription
    try {
      subscription = await retrieveSubscription(candidate.stripeSubscriptionId)
    } catch (error) {
      if (isMissingSubscription(error)) {
        // Nothing runs, so nothing is owed; remember the id so this is logged
        // once and not read, or counted as a failure, every day after.
        summary.missing += 1
        await prisma.users.updateMany({
          where: { id: candidate.id, stripeSubscriptionId: candidate.stripeSubscriptionId },
          data: { missingStripeSubscriptionId: candidate.stripeSubscriptionId },
        })
        log.warn('Subscription no longer exists in Stripe; skipping its notices from now on', {
          userId: candidate.id,
          subscriptionId: candidate.stripeSubscriptionId,
        })
        continue
      }
      summary.failed += 1
      log.warn('Could not read a subscription for its notice; retrying tomorrow', {
        userId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    // Ending counts as not running: cancel_at_period_end, or a cancellation
    // scheduled for a date with cancel_at. Its last charge has been made.
    if (
      !RUNNING_STATUSES.has(subscription.status) ||
      subscription.cancel_at_period_end ||
      subscription.cancel_at !== null
    ) {
      summary.notRunning += 1
      continue
    }

    const start = new Date(subscription.start_date * 1000)
    const dueAt = noticeDueAt(start, candidate.lastSubscriptionNoticeAt)
    if (dueAt > now) {
      summary.notDue += 1
      continue
    }

    // The claim. Matching the value this run read makes it a compare-and-set.
    const claimed = await prisma.users.updateMany({
      where: {
        id: candidate.id,
        stripeSubscriptionId: candidate.stripeSubscriptionId,
        lastSubscriptionNoticeAt: candidate.lastSubscriptionNoticeAt,
      },
      data: { lastSubscriptionNoticeAt: now },
    })
    if (claimed.count !== 1) continue

    const result = await sendEmail(candidate.email, {
      ...noticeDetails(candidate, subscription),
      idempotencyKey: `subscription-notice/${candidate.id}/${dueAt.toISOString().slice(0, 10)}`,
    })

    if (result.success) {
      summary.sent += 1
      continue
    }

    summary.failed += 1
    // Release the claim, only if it is still ours, so tomorrow's run sends it.
    await prisma.users.updateMany({
      where: { id: candidate.id, lastSubscriptionNoticeAt: now },
      data: { lastSubscriptionNoticeAt: candidate.lastSubscriptionNoticeAt },
    })
    log.warn('Subscription notice not sent; released for tomorrow', { userId: candidate.id, error: result.error })
  }

  return summary
}
