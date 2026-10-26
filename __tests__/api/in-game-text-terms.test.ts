/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as postSketchAction } from '@/app/api/game/[gameId]/sketch-and-guess-action/route'
import { POST as postSpyAction } from '@/app/api/game/[gameId]/spy-action/route'
import { POST as postGameState } from '@/app/api/game/[gameId]/state/route'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { requiresTermsAcceptance } from '@/lib/terms-gate'
import { restoreGameEngine } from '@/lib/game-registry'

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
jest.mock('@/lib/game-registry', () => ({
  ...jest.requireActual('@/lib/game-registry'),
  restoreGameEngine: jest.fn(),
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {},
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))
jest.mock('@/lib/games/spy-game', () => ({
  SpyGame: jest.fn().mockImplementation(() => ({
    loadState: jest.fn(),
    makeMove: jest.fn(() => true),
    getState: jest.fn(() => ({ players: [], status: 'playing', data: { phase: 'QUESTIONING' } })),
  })),
  sanitizeSpyStateForBroadcast: jest.fn((state: unknown) => state),
}))

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockRequiresTerms = requiresTermsAcceptance as jest.MockedFunction<typeof requiresTermsAcceptance>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
const mockRestoreGameEngine = restoreGameEngine as jest.MockedFunction<typeof restoreGameEngine>

const HOST = 'host-1'
const GUESSER = 'guest-2'
const THIRD = 'guest-3'
const params = { params: Promise.resolve({ gameId: 'game-123' }) }

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/game/game-123/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  })
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

function seedGame(gameType: string, state: unknown) {
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(state),
    status: 'playing',
    gameType,
    currentTurn: 3,
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    startedAt: new Date('2026-10-19T23:55:00.000Z'),
    players: [dbPlayer(HOST), dbPlayer(GUESSER), dbPlayer(THIRD)],
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType, turnTimer: 0, creatorId: HOST },
  })
}

function sketchRoundInDrawing() {
  const game = new SketchAndGuessGame('game-123', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
  game.addPlayer({ id: HOST, name: 'Host' })
  game.addPlayer({ id: GUESSER, name: 'Bea' })
  game.addPlayer({ id: THIRD, name: 'Cyd' })
  game.startGame()
  const restored = game.getState() as { data: { rounds: Array<{ wordChoices: unknown[] }> } }
  restored.data.rounds[0].wordChoices = [{ id: 'castle', en: ['castle'], no: ['slott'], ru: ['castle'], uk: ['castle'] }]
  game.restoreState(restored as never)
  game.makeMove({ playerId: HOST, type: 'choose-word', data: { wordId: 'castle' }, timestamp: new Date() })
  return game.getState()
}

async function expectTermsRefusal(response: Response) {
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual(expect.objectContaining({ code: 'TERMS_REQUIRED' }))
  expect(prisma.games.updateMany).not.toHaveBeenCalled()
  expect(mockBroadcastToLobby).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockBroadcastToLobby.mockResolvedValue(true)
  ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  mockGetRequestAuthUser.mockResolvedValue({ id: GUESSER, username: GUESSER, suspended: false, isGuest: true })
  mockRequiresTerms.mockResolvedValue(true)
})

describe('text typed inside a game waits for the terms', () => {
  it('refuses a Sketch & Guess guess from a player who has not accepted', async () => {
    seedGame('sketch_and_guess', sketchRoundInDrawing())

    const response = await postSketchAction(request('sketch-and-guess-action', { action: 'submit-guess', data: { guess: 'a tower' } }), params)

    await expectTermsRefusal(response)
    expect(mockRequiresTerms).toHaveBeenCalledWith(GUESSER)
  })

  it.each(['ask-question', 'answer-question'])('refuses a Guess the Spy %s from a player who has not accepted', async (action) => {
    seedGame('guess_the_spy', { players: [], status: 'playing', data: { phase: 'QUESTIONING' } })

    const response = await postSpyAction(request('spy-action', { action, data: { targetId: THIRD, question: 'Is it cold?', answer: 'No' } }), params)

    await expectTermsRefusal(response)
  })

  it('lets a Spy vote through: it carries no typed text', async () => {
    seedGame('guess_the_spy', { players: [], status: 'playing', data: { phase: 'VOTING' } })

    const response = await postSpyAction(request('spy-action', { action: 'vote', data: { targetId: THIRD } }), params)

    expect(response.status).toBe(200)
    expect(mockRequiresTerms).not.toHaveBeenCalled()
  })

  it("refuses a Liar's Party claim from a player who has not accepted", async () => {
    seedGame('liars_party', { players: [], status: 'playing', data: { phase: 'claim', currentClaimantId: GUESSER } })

    const response = await postGameState(request('state', { move: { type: 'submit-claim', data: { claim: 'I can juggle', isBluff: false } } }), params)

    await expectTermsRefusal(response)
    expect(mockRestoreGameEngine).not.toHaveBeenCalled()
  })
})
