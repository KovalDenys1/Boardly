/**
 * Player reports (#1172): what can be reported, the reasons a reporter picks from,
 * and what counts as reporting the same thing twice.
 *
 * Pure constants with no imports, because the report dialog renders these lists in
 * the browser and POST /api/reports validates against the same ones on the server.
 */

/** Everything a player can report. A chat message and a drawing live in a lobby; the rest are on the profile. */
export const REPORT_TARGET_TYPES = ['chat_message', 'drawing', 'username', 'avatar', 'bio'] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

export const PROFILE_REPORT_TARGET_TYPES = ['username', 'avatar', 'bio'] as const
export type ProfileReportTargetType = (typeof PROFILE_REPORT_TARGET_TYPES)[number]

/** A fixed list, so a report is sortable in the Control Panel and translatable in the dialog. */
export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'violence', 'spam', 'personal_info', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** The reporter's own words. */
export const REPORT_NOTE_MAX_CHARS = 500

/** A chat message is at most 500 characters (app/api/lobby/[code]/chat/route.ts), so its quote is too. */
export const REPORT_QUOTED_TEXT_MAX_CHARS = 500

/** What the dialog sends besides the reason and the note. */
export type ReportTarget =
  | {
      targetType: 'chat_message'
      /** The message id the chat route minted. */
      targetId: string
      lobbyCode: string
      /** Who the reporter's screen says wrote it; the server's own copy wins when it still has one. */
      reportedUserId: string
      /** The reporter's copy of the text, kept only when the server's copy is gone (24-hour chat TTL). */
      quotedText: string
    }
  | {
      targetType: 'drawing'
      /** The Sketch & Guess game id. */
      targetId: string
      round: number
      lobbyCode?: string
    }
  | {
      targetType: ProfileReportTargetType
      /** The reported player's user id, as a game screen knows it. */
      targetId: string
      lobbyCode?: string
    }
  | {
      targetType: ProfileReportTargetType
      /** The public profile page knows only this, and does not need to learn the user id. */
      publicProfileId: string
    }

/**
 * The key that, together with the reporter's id, makes a report unique (the
 * `Reports_reporterId_targetKey_key` index).
 *
 * A chat message and a drawing cannot change, so the thing itself is the key. A
 * username, avatar or bio can: the key carries a digest of the content, so a player
 * who renames themselves to something new can be reported again for the new name,
 * while the same name reported twice is still one report.
 */
export function reportTargetKey(
  target:
    | { targetType: 'chat_message'; lobbyCode: string; messageId: string }
    | { targetType: 'drawing'; gameId: string; round: number }
    | { targetType: ProfileReportTargetType; userId: string; contentDigest: string }
): string {
  switch (target.targetType) {
    case 'chat_message':
      return `chat_message:${target.lobbyCode}:${target.messageId}`
    case 'drawing':
      return `drawing:${target.gameId}:${target.round}`
    default:
      return `${target.targetType}:${target.userId}:${target.contentDigest}`
  }
}
