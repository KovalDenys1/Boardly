/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as postGameState } from '@/app/api/game/[gameId]/state/route'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { requiresTermsAcceptance } from '@/lib/terms-gate'

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
const mockRequiresTerms = requiresTermsAcceptance as jest.MockedFunction<typeof requiresTermsAcceptance>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>

const HOST = 'host-1'
const GUEST = 'guest-2'
const THIRD = 'guest-3'
const params = { params: Promise.resolve({ gameId: 'game-123' }) }

function postMove(move: { type: string; data?: Record<string, unknown> }) {
  return postGameState(
    new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ move }),
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

function questioning(turn: { questionerId: string; targetId?: string; pendingQuestion?: string }) {
  const game = new SpyGame('game-123')
  for (const id of [HOST, GUEST, THIRD]) game.addPlayer({ id, name: id })
  game.startGame()
  const state = game.getState()
  state.data.phase = SpyGamePhase.QUESTIONING
  state.data.spyPlayerId = THIRD
  state.data.allLocationNames = ['Airport', 'Zoo']
  state.data.location = 'Airport'
  state.data.phaseStartTime = Date.now()
  state.data.currentQuestionerId = turn.questionerId
  state.data.currentTargetId = turn.targetId ?? null
  state.data.pendingQuestion = turn.pendingQuestion ?? null
  return state
}

function seedSpyGame(state: unknown) {
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(state),
    status: 'playing',
    gameType: 'guess_the_spy',
    currentTurn: 3,
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    lastMoveAt: null,
    startedAt: new Date('2026-10-19T23:55:00.000Z'),
    players: [dbPlayer(HOST), dbPlayer(GUEST), dbPlayer(THIRD)],
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'guess_the_spy', turnTimer: 0, creatorId: HOST },
  })
}

function expectNothingWritten() {
  expect(prisma.games.updateMany).not.toHaveBeenCalled()
  expect(mockBroadcastToLobby).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockBroadcastToLobby.mockResolvedValue(true)
  ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma))
  mockGetRequestAuthUser.mockResolvedValue({ id: GUEST, username: GUEST, suspended: false, isGuest: true })
  mockRequiresTerms.mockResolvedValue(false)
})

describe('Guess the Spy moves posted to the generic state route (#1510)', () => {
  it('refuses a question from a player who has not accepted the terms', async () => {
    mockRequiresTerms.mockResolvedValue(true)
    seedSpyGame(questioning({ questionerId: GUEST }))

    const response = await postMove({ type: 'ask-question', data: { targetId: THIRD, question: 'Is it cold?' } })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'TERMS_REQUIRED' }))
    expect(mockRequiresTerms).toHaveBeenCalledWith(GUEST)
    expectNothingWritten()
  })

  it('refuses an answer from a player who has not accepted the terms', async () => {
    mockRequiresTerms.mockResolvedValue(true)
    seedSpyGame(questioning({ questionerId: THIRD, targetId: GUEST, pendingQuestion: 'Is it cold?' }))

    const response = await postMove({ type: 'answer-question', data: { answer: 'Not at all' } })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'TERMS_REQUIRED' }))
    expectNothingWritten()
  })

  it('lets only the lobby creator start voting', async () => {
    seedSpyGame(questioning({ questionerId: GUEST }))

    const response = await postMove({ type: 'start-voting' })

    expect(response.status).toBe(403)
    expectNothingWritten()
  })

  it('applies an accepted player\'s question the way the Spy route does', async () => {
    seedSpyGame(questioning({ questionerId: GUEST }))

    const response = await postMove({ type: 'ask-question', data: { targetId: THIRD, question: 'Is it cold?' } })

    expect(response.status).toBe(200)
    expect(prisma.games.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'game-123', currentTurn: 3 }) })
    )
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABCD12',
      'spy-action',
      expect.objectContaining({ action: 'ask-question', playerId: GUEST })
    )
  })
})
