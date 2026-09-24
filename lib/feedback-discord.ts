import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { deleteDiscordWebhookMessage } from '@/lib/discord-webhook'

const log = apiLogger('feedback-discord')

export interface FeedbackDiscordCleanup {
  /** Feedback rows whose Discord copy is now gone; their `discordMessageId` is cleared. */
  cleared: string[]
  /** Feedback rows whose Discord copy could not be deleted; their id is kept for a later try. */
  failed: string[]
}

/**
 * Deletes the copies that app/api/feedback/route.ts posted to the Discord feedback
 * channel for the Feedback rows matching `where`.
 *
 * The privacy notice promises that feedback is kept for its retention period and that
 * deleting an account removes the sender from it. Each Discord copy carries the sender's
 * username and id or email, so both the retention rule (lib/data-retention.ts) and
 * detachFeedbackFrom (lib/account-erasure.ts) call this before touching the rows.
 *
 * Discord failures never throw: a row whose copy could not be deleted keeps its message
 * id and is reported in `failed`, so the next retention run tries again.
 */
export async function deleteFeedbackDiscordCopies(where: Prisma.FeedbackWhereInput): Promise<FeedbackDiscordCleanup> {
  const rows = await prisma.feedback.findMany({
    where: { AND: [where, { discordMessageId: { not: null } }] },
    select: { id: true, discordMessageId: true },
  })
  if (rows.length === 0) return { cleared: [], failed: [] }

  const webhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    log.warn('FEEDBACK_DISCORD_WEBHOOK_URL is not set; Discord copies of feedback were not deleted', {
      rows: rows.length,
    })
    return { cleared: [], failed: rows.map((row) => row.id) }
  }

  const cleared: string[] = []
  const failed: string[] = []
  // One at a time: webhook routes are rate limited per webhook, and there are rarely more than a few.
  for (const row of rows) {
    try {
      await deleteDiscordWebhookMessage(webhookUrl, row.discordMessageId as string)
      cleared.push(row.id)
    } catch (error) {
      failed.push(row.id)
      log.error('Failed to delete the Discord copy of a feedback message', { feedbackId: row.id, error })
    }
  }

  if (cleared.length > 0) {
    await prisma.feedback.updateMany({ where: { id: { in: cleared } }, data: { discordMessageId: null } })
  }
  return { cleared, failed }
}
