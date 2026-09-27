/**
 * The staff notification for a new Feedback row, as posted to the Discord feedback
 * channel by app/api/feedback/route.ts.
 *
 * A notification, not a copy (#1133): type, a short preview and the feedback id. The
 * full message, the sender's address and the page stay in the Feedback row, where staff
 * read them in the Control Panel. Discord offers a server owner no processor agreement,
 * so the channel holds only what tells staff to go and look (GDPR Art. 5(1)(c)). No page
 * URL either: a URL can carry a reset token or a public profile id.
 */

export const FEEDBACK_PREVIEW_CHARS = 200

const TYPE_COLOR: Record<string, number> = {
  bug: 0xed4245,
  feature: 0x57f287,
  appeal: 0xe67e22,
  other: 0x95a5a6,
}

const TYPE_EMOJI: Record<string, string> = {
  bug: '🐛',
  feature: '✨',
  appeal: '📣',
  other: '💬',
}

/** At most FEEDBACK_PREVIEW_CHARS characters, counted in code points so an emoji is never split. */
export function feedbackPreview(message: string): string {
  const chars = Array.from(message)
  return chars.length > FEEDBACK_PREVIEW_CHARS
    ? chars.slice(0, FEEDBACK_PREVIEW_CHARS - 1).join('') + '…'
    : message
}

export function buildFeedbackDiscordPayload(feedbackId: string, type: string, message: string) {
  const emoji = TYPE_EMOJI[type] ?? '💬'
  const color = TYPE_COLOR[type] ?? 0x95a5a6

  return {
    // The preview is a stranger's text: it must not ping anyone in the channel.
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: `${emoji} New feedback — ${type}`,
        description: feedbackPreview(message),
        color,
        fields: [
          { name: 'Type', value: `${emoji} ${type}`, inline: true },
          { name: 'Feedback id', value: feedbackId, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  }
}
