import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { deleteDiscordWebhookMessage } from '@/lib/discord-webhook'

const log = apiLogger('report-discord')

export interface ReportDiscordCleanup {
  /** Reports whose Discord notification is now gone; their `discordMessageId` is cleared. */
  cleared: string[]
  /** Reports whose notification could not be deleted; their id is kept for a later try. */
  failed: string[]
}

/**
 * Deletes the notifications app/api/reports/route.ts posted to the Discord feedback
 * channel for the Reports rows matching `where` (#1172).
 *
 * The notification carries a preview of the reported content, which is someone's
 * words, so it must not outlive the report the privacy notice promises to delete after
 * its retention period. The same shape as lib/feedback-discord.ts: Discord failures
 * never throw, and a row whose copy could not be deleted keeps its message id and is
 * reported in `failed`, so the next retention run tries again.
 */
export async function deleteReportDiscordCopies(where: Prisma.ReportsWhereInput): Promise<ReportDiscordCleanup> {
  const rows = await prisma.reports.findMany({
    where: { AND: [where, { discordMessageId: { not: null } }] },
    select: { id: true, discordMessageId: true },
  })
  if (rows.length === 0) return { cleared: [], failed: [] }

  const webhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    log.warn('FEEDBACK_DISCORD_WEBHOOK_URL is not set; Discord copies of reports were not deleted', {
      rows: rows.length,
    })
    return { cleared: [], failed: rows.map((row) => row.id) }
  }

  const cleared: string[] = []
  const failed: string[] = []
  // One at a time: webhook routes are rate limited per webhook.
  for (const row of rows) {
    try {
      await deleteDiscordWebhookMessage(webhookUrl, row.discordMessageId as string)
      cleared.push(row.id)
    } catch (error) {
      failed.push(row.id)
      log.error('Failed to delete the Discord notification of a report', { reportId: row.id, error })
    }
  }

  if (cleared.length > 0) {
    await prisma.reports.updateMany({ where: { id: { in: cleared } }, data: { discordMessageId: null } })
  }
  return { cleared, failed }
}
