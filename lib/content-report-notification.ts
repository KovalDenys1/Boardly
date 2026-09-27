import { feedbackPreview } from '@/lib/feedback-notification'
import type { ReportReason, ReportTargetType } from '@/lib/content-reports'

/**
 * The staff notification for a new report, posted to the Discord feedback channel by
 * app/api/reports/route.ts (#1172).
 *
 * A notification, not a copy, on the same terms as feedback (#1133): the target type,
 * the reason, the report id, whether the evidence is the server's own copy, and a
 * short preview of the reported content. Never the reporter: no id, no name, no
 * email, and not the reporter's note. Never the reported player's id or name either,
 * unless the reported content is that name. Staff open the report in the Control
 * Panel for the rest. No avatar URL (it names the account in its path) and no drawing
 * data: those are described, not shown.
 */

const REPORT_COLOR = 0xe67e22

export interface ContentReportNotification {
  reportId: string
  targetType: ReportTargetType
  reason: ReportReason
  contentSnapshot: string | null
  snapshotSource: 'server' | 'reporter'
  round: number | null
}

/**
 * Discord renders Markdown in an embed description, and the preview is a stranger's
 * text that someone found bad enough to report: a masked link there is a phishing
 * link in the staff channel. Escaped, it shows as the characters it is.
 */
export function escapeDiscordMarkdown(text: string): string {
  return text.replace(/[\\*_~`|>[\]()#-]/g, (char) => `\\${char}`)
}

export function contentReportPreview(report: Pick<ContentReportNotification, 'targetType' | 'contentSnapshot' | 'round'>): string {
  switch (report.targetType) {
    case 'avatar':
      return 'Avatar image – open the report to see it.'
    case 'drawing':
      return `Sketch & Guess drawing, round ${report.round ?? '?'} – open the report to see it.`
    default:
      return escapeDiscordMarkdown(feedbackPreview(report.contentSnapshot ?? ''))
  }
}

export function buildContentReportDiscordPayload(report: ContentReportNotification) {
  return {
    // The preview is a stranger's text: it must not ping anyone in the channel.
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: `New report – ${report.targetType}`,
        description: contentReportPreview(report) || '(empty)',
        color: REPORT_COLOR,
        fields: [
          { name: 'Target', value: report.targetType, inline: true },
          { name: 'Reason', value: report.reason, inline: true },
          { name: 'Report id', value: report.reportId, inline: true },
          {
            name: 'Evidence',
            value: report.snapshotSource === 'server' ? 'server copy' : "reporter's copy (the server no longer had it)",
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  }
}
