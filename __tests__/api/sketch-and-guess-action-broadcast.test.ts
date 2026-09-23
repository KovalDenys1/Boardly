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
import type { SketchWord } from '@/lib/games/sketch-and-guess-words'
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
 * guesser is about to answer: three seats, the word chosen, phase `drawing`
 * (which since #1082 is when everyone guesses). `prompt` is the word's English
 * form; `word` is every form it has.
 */
function buildDrawingRound(extraMoves: Array<{ playerId: string; type: string; data: Record<string, unknown> }> = []) {
  const game = new SketchAndGuessGame('game-123', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
  game.addPlayer({ id: DRAWER, name: 'Host' })
  game.addPlayer({ id: FIRST_GUESSER, name: 'Bea' })
  game.addPlayer({ id: SECOND_GUESSER, name: 'Cyd' })
  game.startGame()

  const data = game.getState().data as { rounds: Array<{ wordChoices: SketchWord[] }> }
  const word = data.rounds[0].wordChoices[0]
  game.makeMove({ playerId: DRAWER, type: 'choose-word', data: { wordId: word.id }, timestamp: new Date() })
  // Spaced out in the past, so the route's own guess clears the 800 ms rate limit.
  extraMoves.forEach((move, index) =>
    game.makeMove({ ...move, timestamp: new Date(Date.now() - 10_000 + index * 1000) })
  )

  return { state: game.getState(), prompt: word.en[0], word }
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

/** Every form of the word, in every language, found anywhere in `published` as a whole JSON string. */
function leakedForms(published: unknown, word: SketchWord): string[] {
  const json = JSON.stringify(published)
  return [...word.en, ...word.no, ...word.ru, ...word.uk].filter((form) => json.includes(JSON.stringify(form)))
}

function seedGame(state: unknown) {
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(state),
    status: 'playing',
    gameType: 'sketch_and_guess',
    currentTurn: 3,
    updatedAt: GAME_UPDATED_AT,
    startedAt: new Date('2026-09-20T11:55:00.000Z'),
    players: [dbPlayer('db-1', DRAWER), dbPlayer('db-2', FIRST_GUESSER), dbPlayer('db-3', SECOND_GUESSER)],
    // The drawer of round 1 created the lobby, so the host is DRAWER.
    lobby: { code: 'ABCD12', gameType: 'sketch_and_guess', turnTimer: 0, creatorId: DRAWER },
  } as never)
}

function asUser(id: string) {
  mockGetRequestAuthUser.mockResolvedValue({ id, username: id, suspended: false, isGuest: true } as never)
}

const post = (body: unknown) => POST(buildRequest(body), { params: Promise.resolve({ gameId: 'game-123' }) })

describe('POST /api/game/[gameId]/sketch-and-guess-action broadcast payload (#1032, #1082)', () => {
  let prompt: string
  let word: SketchWord

  beforeEach(() => {
    jest.clearAllMocks()
    mockBroadcastToLobby.mockResolvedValue(true as never)
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    asUser(FIRST_GUESSER)

    const round = buildDrawingRound()
    prompt = round.prompt
    word = round.word
    seedGame(round.state)
  })

  it('never puts a correct guess, or any form of the word, on the lobby topic', async () => {
    // The worst case: the guess IS the word, and it is right.
    const response = await post({ action: 'submit-guess', data: { guess: prompt } })
    expect(response.status).toBe(200)

    const broadcasts = actionBroadcasts()
    expect(broadcasts).toHaveLength(1)

    const payload = broadcasts[0][2] as Record<string, unknown>
    expect(payload.action).toBe('submit-guess')
    expect(payload.data).toEqual({})

    // Every argument of every broadcast this request made, state included.
    expect(leakedForms(mockBroadcastToLobby.mock.calls, word)).toEqual([])
  })

  it('still tells the lobby who has it, which is all the round needs', async () => {
    await post({ action: 'submit-guess', data: { guess: prompt } })

    const payload = actionBroadcasts()[0][2] as {
      playerId: string
      state: { data: { submittedPlayerIds: string[]; rounds: Array<{ guesses: Array<{ isCorrect: boolean; guess: string }> }> } }
    }
    expect(payload.playerId).toBe(FIRST_GUESSER)
    expect(payload.state.data.submittedPlayerIds).toEqual([FIRST_GUESSER])
    expect(payload.state.data.rounds[0].guesses[0]).toMatchObject({ isCorrect: true, guess: '' })
  })

  it('shows a wrong guess in the feed through the state, never through the move payload', async () => {
    const response = await post({ action: 'submit-guess', data: { guess: 'definitely-not-it' } })
    expect(response.status).toBe(200)

    const payload = actionBroadcasts()[0][2] as {
      data: Record<string, unknown>
      state: { data: { rounds: Array<{ guesses: Array<{ guess: string }> }> } }
    }
    expect(payload.data).toEqual({})
    expect(payload.state.data.rounds[0].guesses[0].guess).toBe('definitely-not-it')
  })

  it('leaves the answering player their own guess and the private result in the response', async () => {
    const response = await post({ action: 'submit-guess', data: { guess: prompt } })
    const body = (await response.json()) as {
      guessResult: { correct: boolean; close: boolean }
      state: { data: { rounds: Array<{ guesses: Array<{ playerId: string; guess: string }> }> } }
    }

    expect(body.guessResult).toEqual({ correct: true, close: false })
    expect(body.state.data.rounds[0].guesses).toHaveLength(1)
    expect(body.state.data.rounds[0].guesses[0].playerId).toBe(FIRST_GUESSER)
    expect(body.state.data.rounds[0].guesses[0].guess).toBe(prompt)
  })

  it('hands the mover a word hint in their own language, and the shared topic none', async () => {
    asUser(SECOND_GUESSER)
    const response = await post({ action: 'submit-guess', data: { guess: 'not it at all' }, locale: 'uk' })
    const body = (await response.json()) as { state: { data: { rounds: Array<{ wordHint?: { lang: string; cells: unknown[] } }> } } }
    expect(body.state.data.rounds[0].wordHint?.lang).toBe('uk')
    expect(body.state.data.rounds[0].wordHint?.cells).toHaveLength(Array.from(word.uk[0]).length)

    const payload = actionBroadcasts()[0][2] as { state: { data: { rounds: Array<{ wordHint?: unknown }> } } }
    expect(payload.state.data.rounds[0].wordHint).toBeUndefined()
  })

  it('tells only the author a guess was close, and never the topic', async () => {
    const elephant = { id: 'elephant', en: ['elephant'], no: ['elefant'], ru: ['слон'], uk: ['слон'] }
    const round = buildDrawingRound()
    const data = round.state.data as { rounds: Array<{ word: SketchWord; prompt: string }> }
    data.rounds[0].word = elephant
    data.rounds[0].prompt = 'elephant'
    seedGame(round.state)

    const response = await post({ action: 'submit-guess', data: { guess: 'elephan' } })
    const body = (await response.json()) as { guessResult: { correct: boolean; close: boolean } }
    expect(body.guessResult).toEqual({ correct: false, close: true })
    expect(JSON.stringify(mockBroadcastToLobby.mock.calls)).not.toContain('close')
  })

  it('answers 429 to a guess sent too soon after the last one', async () => {
    const round = buildDrawingRound()
    const data = round.state.data as { rounds: Array<{ guesses: unknown[] }> }
    data.rounds[0].guesses.push({ id: 'r1-g1', playerId: FIRST_GUESSER, guess: 'just now', submittedAt: Date.now(), isCorrect: false })
    seedGame(round.state)

    const response = await post({ action: 'submit-guess', data: { guess: 'again' } })
    const body = (await response.json()) as { code: string }
    expect(response.status).toBe(429)
    expect(body.code).toBe('GUESS_TOO_FAST')
    expect(prisma.games.updateMany).not.toHaveBeenCalled()
  })

  it('does not broadcast the word the drawer chose', async () => {
    const game = new SketchAndGuessGame('game-123', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
    game.addPlayer({ id: DRAWER, name: 'Host' })
    game.addPlayer({ id: FIRST_GUESSER, name: 'Bea' })
    game.addPlayer({ id: SECOND_GUESSER, name: 'Cyd' })
    game.startGame()
    const choices = (game.getState().data as { rounds: Array<{ wordChoices: SketchWord[] }> }).rounds[0].wordChoices
    seedGame(game.getState())
    asUser(DRAWER)

    const response = await post({ action: 'choose-word', data: { wordId: choices[1].id } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { state: { data: { rounds: Array<{ word: SketchWord }> } } }
    expect(body.state.data.rounds[0].word.id).toBe(choices[1].id)

    expect(actionBroadcasts()[0][2]).toMatchObject({ action: 'choose-word', data: {} })
    for (const choice of choices) expect(leakedForms(mockBroadcastToLobby.mock.calls, choice)).toEqual([])
  })
})

describe('POST /api/game/[gameId]/sketch-and-guess-action accept-guess (#1082)', () => {
  let wrongGuessId: string

  beforeEach(() => {
    jest.clearAllMocks()
    mockBroadcastToLobby.mockResolvedValue(true as never)
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })

    const round = buildDrawingRound([
      { playerId: FIRST_GUESSER, type: 'submit-guess', data: { guess: 'a near miss' } },
      { playerId: SECOND_GUESSER, type: 'submit-guess', data: { guess: 'something else' } },
    ])
    wrongGuessId = (round.state.data as { rounds: Array<{ guesses: Array<{ id: string }> }> }).rounds[0].guesses[0].id
    seedGame(round.state)
  })

  it('refuses anyone but the host, before the engine is asked', async () => {
    asUser(SECOND_GUESSER)
    const response = await post({ action: 'accept-guess', data: { guessId: wrongGuessId } })
    const body = (await response.json()) as { code: string }

    expect(response.status).toBe(403)
    expect(body.code).toBe('NOT_HOST')
    expect(prisma.games.updateMany).not.toHaveBeenCalled()
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
  })

  it('refuses the author of the guess even as a seated player', async () => {
    asUser(FIRST_GUESSER)
    const response = await post({ action: 'accept-guess', data: { guessId: wrongGuessId } })
    expect(response.status).toBe(403)
  })

  it('lets the host accept it: the guess turns correct and scores', async () => {
    asUser(DRAWER)
    const response = await post({ action: 'accept-guess', data: { guessId: wrongGuessId } })
    const body = (await response.json()) as {
      state: { data: { scores: Record<string, number>; rounds: Array<{ guesses: Array<{ id: string; isCorrect: boolean; acceptedByHost?: boolean }> }> } }
    }

    expect(response.status).toBe(200)
    expect(body.state.data.rounds[0].guesses[0]).toMatchObject({ id: wrongGuessId, isCorrect: true, acceptedByHost: true })
    expect(body.state.data.scores[FIRST_GUESSER]).toBeGreaterThan(0)
    expect(prisma.games.updateMany).toHaveBeenCalledTimes(1)
    expect(actionBroadcasts()[0][2]).toMatchObject({ action: 'accept-guess', data: {} })
  })

  it('is idempotent: accepting an accepted guess succeeds and writes nothing', async () => {
    const round = buildDrawingRound([
      { playerId: FIRST_GUESSER, type: 'submit-guess', data: { guess: 'a near miss' } },
    ])
    const guessId = (round.state.data as { rounds: Array<{ guesses: Array<{ id: string }> }> }).rounds[0].guesses[0].id
    const accepted = new SketchAndGuessGame('game-123')
    accepted.restoreState(round.state as never)
    accepted.makeMove({ playerId: DRAWER, type: 'accept-guess', data: { guessId, authorizedAsHost: true }, timestamp: new Date() })
    seedGame(accepted.getState())
    asUser(DRAWER)

    const response = await post({ action: 'accept-guess', data: { guessId } })

    expect(response.status).toBe(200)
    expect(prisma.games.updateMany).not.toHaveBeenCalled()
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
  })

  it('does not let the host skip the matcher with a guess id that does not exist', async () => {
    asUser(DRAWER)
    const response = await post({ action: 'accept-guess', data: { guessId: 'r1-g99' } })
    expect(response.status).toBe(400)
  })
})
