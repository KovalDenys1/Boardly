/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as postGameState } from '@/app/api/game/[gameId]/state/route'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { requiresTermsAcceptance } from '@/lib/terms-gate'
import { appendGameReplaySnapshot } from '@/lib/game-replay'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    games: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    players: { update: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/terms-gate', () => ({ requiresTermsAcceptance: jest.fn() }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {},
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
const params = { params: Promise.resolve({ gameId: 'game-123' }) }

let clock = 1_000_000
let nowSpy: jest.SpyInstance<number, []>

function postVote(decision: 'challenge' | 'believe') {
  return postGameState(
    new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ move: { type: 'submit-challenge', data: { decision } } }),
    }),
    params
  )
}

function dbPlayer(userId: string) {
  return {
    id: `db-${userId}`,
    userId,
    score: 0,
    scorecard: null,
    finalScore: null,
    placement: null,
    isWinner: false,
    leftAt: null,
    user: { id: userId, username: userId, bot: null },
  }
}

/** p1 bluffs; p2, p3, p4 challenge, p6 believes, p5 has not voted. Returns the vote's deadline. */
function seedSplitVote(status = 'playing'): number {
  const game = new LiarsPartyGame('game-123', { maxPlayers: 12, minPlayers: 4, rules: { maxRounds: 10, eliminationStrikes: 2 } })
  for (const id of IDS) game.addPlayer({ id, name: id })
  game.startGame()
  const move = (playerId: string, type: string, data: Record<string, unknown>) =>
    expect(game.makeMove({ playerId, type, data, timestamp: new Date() })).toBe(true)
  move('p1', 'submit-claim', { claim: 'I have exactly five points', isBluff: true })
  for (const voter of ['p2', 'p3', 'p4']) move(voter, 'submit-challenge', { decision: 'challenge' })
  move('p6', 'submit-challenge', { decision: 'believe' })
  const state = game.getState()
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(state),
    status,
    gameType: 'liars_party',
    currentTurn: 5,
    updatedAt: new Date('2026-10-26T10:00:00.000Z'),
    lastMoveAt: new Date(state.lastMoveAt),
    startedAt: new Date('2026-10-26T09:55:00.000Z'),
    players: IDS.map(dbPlayer),
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'liars_party', turnTimer: 60, creatorId: 'p1' },
  })
  return (state.lastMoveAt as number) + 60_000
}

beforeEach(() => {
  jest.clearAllMocks()
  clock = 1_000_000
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
  ;(broadcastToLobby as jest.Mock).mockResolvedValue(true)
  ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.players.update as jest.Mock).mockResolvedValue({})
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma))
  mockGetRequestAuthUser.mockResolvedValue({ id: 'p5', username: 'p5', suspended: false, isGuest: true })
  ;(requiresTermsAcceptance as jest.Mock).mockResolvedValue(false)
})

afterEach(() => nowSpy.mockRestore())

describe("a Liar's Party vote that arrives after the vote deadline", () => {
  it('closes the vote at its deadline, as the clock would have, and refuses the late vote', async () => {
    const deadline = seedSplitVote()
    clock = deadline + 1_000

    const response = await postVote('believe')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Turn already ended', code: 'TURN_ALREADY_ENDED', skipped: true })
    const writes = (prisma.games.updateMany as jest.Mock).mock.calls
    expect(writes).toHaveLength(1)
    const written = JSON.parse(JSON.stringify(writes[0][0].data.state))
    expect(written.data.phase).toBe('reveal')
    expect(written.data.challengeVotes.find((vote) => vote.playerId === 'p5')).toEqual(
      expect.objectContaining({ decision: 'believe', autoSubmitted: true, submittedAt: deadline })
    )
    expect(written.data.roundResults[0]).toEqual(expect.objectContaining({
      challengedBy: ['p2', 'p3', 'p4'],
      believedBy: ['p6', 'p5'],
      bluffCaught: true,
      claimantScoreDelta: -12,
      claimantStrikeDelta: 1,
      resolvedAt: deadline,
    }))
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'liars_party:timeout-fallback',
      actionPayload: expect.objectContaining({ source: 'move', autoSubmittedPlayerIds: ['p5'] }),
    }))
  })

  it('leaves an abandoned game alone and refuses the vote as before', async () => {
    const deadline = seedSplitVote('abandoned')
    clock = deadline + 1_000
    mockGetRequestAuthUser.mockResolvedValue({ id: 'p2', username: 'p2', suspended: false, isGuest: true })

    const response = await postVote('believe')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid move' })
    expect(prisma.games.updateMany).not.toHaveBeenCalled()
    expect(broadcastToLobby).not.toHaveBeenCalled()
    expect(appendGameReplaySnapshot).not.toHaveBeenCalled()
  })

  it('takes a vote that arrives before the deadline', async () => {
    const deadline = seedSplitVote()
    clock = deadline - 1_000

    const response = await postVote('believe')

    expect(response.status).toBe(200)
    const written = JSON.parse(JSON.stringify((prisma.games.updateMany as jest.Mock).mock.calls[0][0].data.state))
    expect(written.data.challengeVotes.find((vote) => vote.playerId === 'p5')).toEqual(
      expect.objectContaining({ decision: 'believe', submittedAt: deadline - 1_000 })
    )
    expect(written.data.challengeVotes.find((vote) => vote.playerId === 'p5').autoSubmitted).toBeUndefined()
  })
})
