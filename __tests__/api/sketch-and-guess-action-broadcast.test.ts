/**
 * @jest-environment @edge-runtime/jest-environment
 */

/**
 * #1032 closed the answer leak on the state the route returns and on the state
 * it broadcasts, and left the third copy open: the same broadcast carries the
 * move's own payload, and for a guess that payload is the word. The lobby topic
 * is the single channel every seated player joins
 * (lib/lobby-channel-registry.ts), so the first correct guess – which is the
 * prompt, spelled out – reached everyone else the moment it landed.
 *
 * The sanitizer tests in __tests__/lib/games/sketch-and-guess-game.test.ts call
 * the redaction directly and so could not see this; these drive the real route
 * with the real engine and read what actually goes on the wire.
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/sketch-and-guess-action/route'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    players: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const DRAWER = 'cmua6hebe0000aksighngh8r3'
const FIRST_GUESSER = 'guest-4f9bcf7e-1167-4596-abe3-a3983f932586'
const SECOND_GUESSER = 'guest-0a7a332d-a9dc-42c4-8a34-375259b2f741'
const GAME_UPDATED_AT = new Date('2026-09-20T12:00:00.000Z')

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>

/**
 * A real round, played with the real engine up to the point where the first
 * guesser is about to answer: three seats, the drawing submitted, phase
 * `guessing`. The prompt is whatever the engine drew from its pool.
 */
function buildGuessingRound() {
  const game = new SketchAndGuessGame('game-123', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
  game.addPlayer({ id: DRAWER, name: 'Host' })
  game.addPlayer({ id: FIRST_GUESSER, name: 'Bea' })
  game.addPlayer({ id: SECOND_GUESSER, name: 'Cyd' })
  game.startGame()

  const data = game.getState().data as { rounds: Array<{ prompt: string }>; phase: string }
  const prompt = data.rounds[0].prompt
  game.makeMove({
    playerId: DRAWER,
    type: 'submit-drawing',
    data: { content: '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}' },
    timestamp: new Date(),
  })

  return { state: game.getState(), prompt }
}

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/game/game-123/sketch-and-guess-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function dbPlayer(id: string, userId: string) {
  return {
    id,
    userId,
    score: 0,
    scorecard: null,
    finalScore: null,
    placement: null,
    isWinner: false,
    user: { id: userId, username: userId, bot: null },
  }
}

function actionBroadcasts() {
  return mockBroadcastToLobby.mock.calls.filter((call) => call[1] === 'sketch-and-guess-action')
}

describe('POST /api/game/[gameId]/sketch-and-guess-action broadcast payload (#1032)', () => {
  let prompt: string

  beforeEach(() => {
    jest.clearAllMocks()
    mockBroadcastToLobby.mockResolvedValue(true as never)
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    mockGetRequestAuthUser.mockResolvedValue({
      id: FIRST_GUESSER,
      username: 'Bea',
      suspended: false,
      isGuest: true,
    } as never)

    const round = buildGuessingRound()
    prompt = round.prompt

    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-123',
      state: JSON.stringify(round.state),
      status: 'playing',
      gameType: 'sketch_and_guess',
      currentTurn: 3,
      updatedAt: GAME_UPDATED_AT,
      startedAt: new Date('2026-09-20T11:55:00.000Z'),
      players: [dbPlayer('db-1', DRAWER), dbPlayer('db-2', FIRST_GUESSER), dbPlayer('db-3', SECOND_GUESSER)],
      lobby: { code: 'ABCD12', gameType: 'sketch_and_guess', turnTimer: 0 },
    } as never)
  })

  it('never puts a guess on the lobby topic, not even the correct one', async () => {
    // The worst case: the guess IS the prompt, and it is right.
    const response = await POST(buildRequest({ action: 'submit-guess', data: { guess: prompt } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })
    expect(response.status).toBe(200)

    const broadcasts = actionBroadcasts()
    expect(broadcasts).toHaveLength(1)

    const payload = broadcasts[0][2] as Record<string, unknown>
    expect(payload.action).toBe('submit-guess')
    expect(payload.data).toEqual({})

    // Every argument of every broadcast this request made, state included.
    expect(JSON.stringify(mockBroadcastToLobby.mock.calls)).not.toContain(prompt)
  })

  it('still tells the lobby that somebody answered, which is all the round needs', async () => {
    await POST(buildRequest({ action: 'submit-guess', data: { guess: prompt } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })

    const payload = actionBroadcasts()[0][2] as {
      playerId: string
      state: { data: { submittedPlayerIds: string[] } }
    }
    expect(payload.playerId).toBe(FIRST_GUESSER)
    expect(payload.state.data.submittedPlayerIds).toEqual([FIRST_GUESSER])
  })

  it('keeps the wrong guesses off the topic too – a wrong guess names the guesser', async () => {
    const response = await POST(buildRequest({ action: 'submit-guess', data: { guess: 'definitely-not-it' } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })
    expect(response.status).toBe(200)

    expect(JSON.stringify(mockBroadcastToLobby.mock.calls)).not.toContain('definitely-not-it')
  })

  it('leaves the answering player their own guess in the response they get back', async () => {
    const response = await POST(buildRequest({ action: 'submit-guess', data: { guess: prompt } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })
    const body = (await response.json()) as {
      state: { data: { rounds: Array<{ guesses: Array<{ playerId: string; guess: string }> }> } }
    }

    // Their own answer comes back to them – that is how "you have answered" is
    // read – and this is a private response, not the shared topic.
    expect(body.state.data.rounds[0].guesses).toHaveLength(1)
    expect(body.state.data.rounds[0].guesses[0].playerId).toBe(FIRST_GUESSER)
    expect(body.state.data.rounds[0].guesses[0].guess).toBe(prompt)
  })
})
