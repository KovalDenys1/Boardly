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
 * so staff know it is a claim, not a record. For that case both the reported player
 * and the reporter must have sat in the lobby, so a report cannot put words in a
 * stranger's mouth, and a stranger cannot file one.
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
  contentSnapshot: string
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

async function resolveChatMessage(
  target: Extract<ReportTarget, { targetType: 'chat_message' }>,
  reporterId: string
): Promise<ReportTargetResolution> {
  const lobby = await prisma.lobbies.findUnique({ where: { code: target.lobbyCode }, select: { id: true } })
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
    // The history no longer has it. The reporter's copy is all that is left, so it
    // is kept, but only between two people who both sat in this lobby: the words
    // are attributed to someone who could have written them, by someone who could
    // have read them.
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
      contentSnapshot: round.drawingContent,
      snapshotSource: 'server',
    },
  }
}

async function resolveProfileField(
  target: Extract<ReportTarget, { targetType: 'username' | 'avatar' | 'bio' }>,
  reporterId: string
): Promise<ReportTargetResolution> {
  const where = 'publicProfileId' in target ? { publicProfileId: target.publicProfileId } : { id: target.targetId }
  const user = await prisma.users.findUnique({
    where,
    select: { id: true, username: true, avatarUrl: true, image: true, bio: true, bot: { select: { id: true } } },
  })
  if (!user) return notFound('Player not found')
  if (user.id === reporterId) return { ok: false, refusal: SELF_REPORT_REFUSAL }
  if (user.bot) return notReportable()

  const content =
    target.targetType === 'username'
      ? user.username
      : target.targetType === 'avatar'
        ? user.avatarUrl ?? user.image
        : user.bio
  if (!content || content.trim().length === 0) return nothingToReport()

  return {
    ok: true,
    target: {
      targetType: target.targetType,
      targetId: user.id,
      targetKey: reportTargetKey({ targetType: target.targetType, userId: user.id, contentDigest: digest(content) }),
      reportedUserId: user.id,
      lobbyCode: 'lobbyCode' in target ? target.lobbyCode ?? null : null,
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
