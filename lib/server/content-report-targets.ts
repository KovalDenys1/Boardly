import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { getChatHistory } from '@/lib/chat-history'
import { parsePersistedGameState } from '@/lib/persisted-game-state'
import { reportTargetKey, type ReportTarget, type ReportTargetType } from '@/lib/content-reports'

/**
 * Turns what the report dialog sent into what POST /api/reports stores (#1172): who
 * the report is about, and a copy of the reported content read from our own records
 * wherever we still hold them.
 *
 * The reporter's copy is never preferred. A chat message is looked up in the lobby's
 * history, a drawing in the game state and a profile field on the user row; the text
 * the client sent is kept only for a chat message the history no longer has (24-hour
 * TTL, 50 messages, or Redis down), and is then marked `snapshotSource: 'reporter'`
 * so staff know it is a claim, not a record. For that case the message id must be one
 * the chat route could have minted and the history could have trimmed
 * (couldHaveBeenTrimmed), and both the reported player and the reporter must have sat
 * in the lobby, so a report cannot put invented words in anyone's mouth.
 */

export interface ResolvedReportTarget {
  targetType: ReportTargetType
  targetId: string
  targetKey: string
  /** Null only when the account is already gone and the server still held the content. */
  reportedUserId: string | null
  lobbyCode: string | null
  gameId: string | null
  round: number | null
  /** The reported text or avatar URL. Null for a drawing, which is kept in ReportedDrawings instead. */
  contentSnapshot: string | null
  /** A drawing's content, for the one ReportedDrawings row of its game and round. */
  drawingSnapshot?: string
  snapshotSource: 'server' | 'reporter'
}

export type ReportRefusalCode = 'TARGET_NOT_FOUND' | 'NOTHING_TO_REPORT' | 'CANNOT_REPORT_SELF' | 'TARGET_NOT_REPORTABLE'

export interface ReportRefusal {
  status: 400 | 404
  code: ReportRefusalCode
  error: string
}

export type ReportTargetResolution = { ok: true; target: ResolvedReportTarget } | { ok: false; refusal: ReportRefusal }

const notFound = (error = 'Nothing to report was found'): ReportTargetResolution => ({
  ok: false,
  refusal: { status: 404, code: 'TARGET_NOT_FOUND', error },
})
const nothingToReport = (): ReportTargetResolution => ({
  ok: false,
  refusal: { status: 404, code: 'NOTHING_TO_REPORT', error: 'There is nothing there to report' },
})
export const SELF_REPORT_REFUSAL: ReportRefusal = {
  status: 400,
  code: 'CANNOT_REPORT_SELF',
  error: 'You cannot report yourself',
}
const notReportable = (): ReportTargetResolution => ({
  ok: false,
  refusal: { status: 400, code: 'TARGET_NOT_REPORTABLE', error: 'This player cannot be reported' },
})

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/** Bots' names and avatars are ours; a report of one is a report to ourselves. */
async function loadReportedUser(userId: string): Promise<{ exists: boolean; isBot: boolean }> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, bot: { select: { id: true } } },
  })
  return { exists: !!user, isBot: !!user?.bot }
}

/**
 * The chat route mints every message id as `${Date.now()}-${random base 36}`
 * (app/api/lobby/[code]/chat/route.ts). The millisecond prefix says when the message
 * was sent, which is what lets a missing message be told apart from an invented one.
 */
const CHAT_MESSAGE_ID = /^(\d{13})-[0-9a-z]{1,32}$/

export function chatMessageIdTime(id: string): number | null {
  const match = CHAT_MESSAGE_ID.exec(id)
  if (!match) return null
  const sentAt = Number(match[1])
  return Number.isSafeInteger(sentAt) ? sentAt : null
}

function storedMessageTime(message: { id: string; timestamp?: number }): number | null {
  return typeof message.timestamp === 'number' ? message.timestamp : chatMessageIdTime(message.id)
}

/**
 * Whether a message the history does not hold could still have been real. The history
 * keeps a lobby's newest 50 messages, so a message sent at or after the oldest one it
 * still holds would be in it: an id from that window that is not there was never sent.
 * An id that is malformed, from the future, or older than the lobby was never minted
 * by the chat route at all. What is left is a message old enough to have been trimmed,
 * or one whose history is gone (24-hour TTL, Redis down).
 */
function couldHaveBeenTrimmed(
  messageId: string,
  history: ReadonlyArray<{ id: string; timestamp?: number }>,
  lobbyCreatedAt: Date,
  now: number
): boolean {
  const sentAt = chatMessageIdTime(messageId)
  if (sentAt === null || sentAt > now || sentAt < lobbyCreatedAt.getTime()) return false
  if (history.length === 0) return true
  const times = history.map(storedMessageTime).filter((time): time is number => time !== null)
  if (times.length === 0) return true
  return sentAt < Math.min(...times)
}

async function resolveChatMessage(
  target: Extract<ReportTarget, { targetType: 'chat_message' }>,
  reporterId: string
): Promise<ReportTargetResolution> {
  const lobby = await prisma.lobbies.findUnique({
    where: { code: target.lobbyCode },
    select: { id: true, createdAt: true },
  })
  if (!lobby) return notFound('Lobby not found')

  const history = await getChatHistory(target.lobbyCode)
  const stored = history.find((message) => message.id === target.targetId)

  let reportedUserId: string | null
  let contentSnapshot: string
  let snapshotSource: 'server' | 'reporter'
  if (stored) {
    reportedUserId = stored.userId
    contentSnapshot = stored.message
    snapshotSource = 'server'
  } else {
    // An id the history should still hold, or one the chat route never minted, is
    // an invented message, whoever it names.
    if (!couldHaveBeenTrimmed(target.targetId, history, lobby.createdAt, Date.now())) {
      return notFound('Message not found')
    }
    // The history no longer has it. The reporter's copy is all that is left, so it
    // is kept, marked unverified, but only between two people who both sat in this
    // lobby: the words are attributed to someone who could have written them, by
    // someone who could have read them.
    const [authorSeat, reporterSeat] = await Promise.all([
      prisma.players.findFirst({
        where: { userId: target.reportedUserId, game: { lobbyId: lobby.id } },
        select: { id: true },
      }),
      prisma.players.findFirst({
        where: { userId: reporterId, game: { lobbyId: lobby.id } },
        select: { id: true },
      }),
    ])
    if (!authorSeat || !reporterSeat) return notFound('Message not found')
    reportedUserId = target.reportedUserId
    contentSnapshot = target.quotedText
    snapshotSource = 'reporter'
  }

  if (reportedUserId === reporterId) return { ok: false, refusal: SELF_REPORT_REFUSAL }
  const reported = await loadReportedUser(reportedUserId)
  if (reported.isBot) return notReportable()

  return {
    ok: true,
    target: {
      targetType: 'chat_message',
      targetId: target.targetId,
      targetKey: reportTargetKey({ targetType: 'chat_message', lobbyCode: target.lobbyCode, messageId: target.targetId }),
      reportedUserId: reported.exists ? reportedUserId : null,
      lobbyCode: target.lobbyCode,
      gameId: null,
      round: null,
      contentSnapshot,
      snapshotSource,
    },
  }
}

interface StoredSketchRound {
  round?: unknown
  drawerId?: unknown
  drawingContent?: unknown
}

async function resolveDrawing(
  target: Extract<ReportTarget, { targetType: 'drawing' }>,
  reporterId: string
): Promise<ReportTargetResolution> {
  const game = await prisma.games.findUnique({
    where: { id: target.targetId },
    select: { id: true, gameType: true, state: true, lobby: { select: { code: true } } },
  })
  if (!game || game.gameType !== 'sketch_and_guess') return notFound('Game not found')

  let rounds: StoredSketchRound[] = []
  try {
    const state = parsePersistedGameState<{ data?: { rounds?: unknown } }>(game.state)
    rounds = Array.isArray(state?.data?.rounds) ? (state.data.rounds as StoredSketchRound[]) : []
  } catch {
    rounds = []
  }
  const round = rounds.find((entry) => entry?.round === target.round)
  if (!round || typeof round.drawerId !== 'string') return notFound('Round not found')
  if (typeof round.drawingContent !== 'string' || round.drawingContent.length === 0) return nothingToReport()

  if (round.drawerId === reporterId) return { ok: false, refusal: SELF_REPORT_REFUSAL }
  const reported = await loadReportedUser(round.drawerId)
  if (reported.isBot) return notReportable()

  return {
    ok: true,
    target: {
      targetType: 'drawing',
      targetId: game.id,
      targetKey: reportTargetKey({ targetType: 'drawing', gameId: game.id, round: target.round }),
      reportedUserId: reported.exists ? round.drawerId : null,
      // The lobby the game is in, not the one the client named.
      lobbyCode: game.lobby?.code ?? null,
      gameId: game.id,
      round: target.round,
      // A drawing can be 120 KB: it is kept once per game and round, in
      // ReportedDrawings, and every report of it points there.
      contentSnapshot: null,
      drawingSnapshot: round.drawingContent,
      snapshotSource: 'server',
    },
  }
}

/** Both people had a seat in a game of this lobby. */
async function bothSatIn(lobbyCode: string, firstUserId: string, secondUserId: string): Promise<boolean> {
  const [first, second] = await Promise.all(
    [firstUserId, secondUserId].map((userId) =>
      prisma.players.findFirst({ where: { userId, game: { lobby: { code: lobbyCode } } }, select: { id: true } })
    )
  )
  return !!first && !!second
}

/**
 * Whether the reporter may see this player's public profile, by the rule
 * app/u/[publicProfileId]/page.tsx applies: public to everyone, friends-only to
 * friends, private to nobody else. Guests and bots have no public profile.
 */
async function publicProfileVisibleTo(
  user: {
    id: string
    isGuest: boolean
    publicProfileId: string | null
    bot: { id: string } | null
    accountPreferences: { profileVisibility: string } | null
  },
  reporterId: string
): Promise<boolean> {
  if (user.isGuest || user.bot || !user.publicProfileId) return false
  const visibility = user.accountPreferences?.profileVisibility ?? 'public'
  if (visibility === 'public') return true
  if (visibility !== 'friends') return false
  const friendship = await prisma.friendships.findFirst({
    where: {
      OR: [
        { user1Id: reporterId, user2Id: user.id },
        { user1Id: user.id, user2Id: reporterId },
      ],
    },
    select: { id: true },
  })
  return !!friendship
}

async function resolveProfileField(
  target: Extract<ReportTarget, { targetType: 'username' | 'avatar' | 'bio' }>,
  reporterId: string
): Promise<ReportTargetResolution> {
  const viaPublicProfile = 'publicProfileId' in target
  const where = viaPublicProfile ? { publicProfileId: target.publicProfileId } : { id: target.targetId }
  const user = await prisma.users.findUnique({
    where,
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      image: true,
      bio: true,
      isGuest: true,
      publicProfileId: true,
      bot: { select: { id: true } },
      accountPreferences: { select: { profileVisibility: true } },
    },
  })
  if (!user) return notFound('Player not found')
  if (user.id === reporterId) return { ok: false, refusal: SELF_REPORT_REFUSAL }

  // Reached through the public profile, or a bio (which only the public profile
  // shows), the report sees exactly what the page would: a profile hidden from the
  // reporter answers as if it did not exist, whatever it holds, so the answer cannot
  // be used to learn whether a private profile has a bio. A username and an avatar
  // are shown on every game screen, so reached by user id they need no such check.
  //
  // The username and the picture are the exception on the public profile too (#1226):
  // they are public everywhere, a hidden profile's page shows both, and the leaderboard
  // lists both, so the reporter is reporting what they saw. The bio stays hidden. Only a
  // real profile qualifies, never a guest's or one without a public id.
  const publicFieldOfProfile =
    viaPublicProfile &&
    (target.targetType === 'username' || target.targetType === 'avatar') &&
    !user.isGuest &&
    !!user.publicProfileId
  if ((viaPublicProfile || target.targetType === 'bio') && !publicFieldOfProfile) {
    if (!(await publicProfileVisibleTo(user, reporterId))) return notFound('Player not found')
  }
  if (user.bot) return notReportable()

  const content =
    target.targetType === 'username'
      ? user.username
      : target.targetType === 'avatar'
        ? user.avatarUrl ?? user.image
        : user.bio
  if (!content || content.trim().length === 0) return nothingToReport()

  // The lobby is context for staff, so it is kept only when both people really
  // played in it; a lobby code the client made up is dropped, not stored.
  const claimedLobby = 'lobbyCode' in target ? target.lobbyCode ?? null : null
  const lobbyCode = claimedLobby && (await bothSatIn(claimedLobby, reporterId, user.id)) ? claimedLobby : null

  return {
    ok: true,
    target: {
      targetType: target.targetType,
      targetId: user.id,
      targetKey: reportTargetKey({ targetType: target.targetType, userId: user.id, contentDigest: digest(content) }),
      reportedUserId: user.id,
      lobbyCode,
      gameId: null,
      round: null,
      contentSnapshot: content,
      snapshotSource: 'server',
    },
  }
}

export async function resolveReportTarget(target: ReportTarget, reporterId: string): Promise<ReportTargetResolution> {
  switch (target.targetType) {
    case 'chat_message':
      return resolveChatMessage(target, reporterId)
    case 'drawing':
      return resolveDrawing(target, reporterId)
    default:
      return resolveProfileField(target, reporterId)
  }
}
