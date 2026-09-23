/**
 * @jest-environment @edge-runtime/jest-environment
 */

/**
 * #1034 mutes the Sketch & Guess drawer's chat for the live part of a round:
 * they know the word and the scoring pays them 40 points for every correct
 * guess, so the chat is a channel they profit from leaking it down. The page
 * greys their composer out, which is the half that stops an honest player. This
 * is the half that stops the other one – the same rule on POST
 * /api/lobby/[code]/chat, which is what the browser actually calls.
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/[code]/chat/route'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { persistChatMessage } from '@/lib/chat-history'
import { broadcastToLobby } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: { findUnique: jest.fn() },
    games: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/chat-history', () => ({
  persistChatMessage: jest.fn().mockResolvedValue(undefined),
  getChatHistory: jest.fn().mockResolvedValue([]),
}))

const DRAWER = 'cmua6hebe0000aksighngh8r3'
const GUESSER = 'guest-4f9bcf7e-1167-4596-abe3-a3983f932586'
const THIRD = 'guest-0a7a332d-a9dc-42c4-8a34-375259b2f741'

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockPersistChatMessage = persistChatMessage as jest.MockedFunction<typeof persistChatMessage>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>

/** A real round played to `phase`, with the real engine. */
function playTo(phase: 'choosing' | 'drawing' | 'reveal') {
  const game = new SketchAndGuessGame('game-123', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
  game.addPlayer({ id: DRAWER, name: 'Host' })
  game.addPlayer({ id: GUESSER, name: 'Bea' })
  game.addPlayer({ id: THIRD, name: 'Cyd' })
  game.startGame()

  const choices = (game.getState().data as { rounds: Array<{ wordChoices: Array<{ id: string; en: string[] }> }> })
    .rounds[0].wordChoices

  if (phase !== 'choosing') {
    game.makeMove({ playerId: DRAWER, type: 'choose-word', data: { wordId: choices[0].id }, timestamp: new Date() })
  }
  if (phase === 'reveal') {
    // Every guesser has it, which ends the round early (#1082).
    game.makeMove({ playerId: GUESSER, type: 'submit-guess', data: { guess: choices[0].en[0] }, timestamp: new Date() })
    game.makeMove({ playerId: THIRD, type: 'submit-guess', data: { guess: choices[0].en[0] }, timestamp: new Date() })
  }

  const state = game.getState()
  expect((state.data as { phase: string }).phase).toBe(phase)
  return state
}

function seedLobby(state: unknown, gameType = 'sketch_and_guess', status = 'playing') {
  ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
    id: 'lobby-1',
    games: [{ id: 'game-123', gameType, status, players: [{ id: 'db-1' }] }],
  } as never)
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({ state: JSON.stringify(state) } as never)
}

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/lobby/ABCD12/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'it rhymes with the thing I drew' }),
  })
}

const post = () => POST(buildRequest(), { params: Promise.resolve({ code: 'ABCD12' }) })

describe('POST /api/lobby/[code]/chat mutes the Sketch & Guess drawer (#1034)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBroadcastToLobby.mockResolvedValue(true as never)
    mockPersistChatMessage.mockResolvedValue(undefined as never)
  })

  function asUser(id: string) {
    mockGetRequestAuthUser.mockResolvedValue({ id, username: 'Someone', suspended: false, isGuest: false } as never)
  }

  it('refuses the drawer while they are drawing', async () => {
    seedLobby(playTo('drawing'))
    asUser(DRAWER)

    const response = await post()
    const body = (await response.json()) as { code?: string }

    expect(response.status).toBe(403)
    expect(body.code).toBe('DRAWER_CHAT_MUTED')
    expect(mockPersistChatMessage).not.toHaveBeenCalled()
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
  })

  it('refuses the drawer while they are choosing the word too', async () => {
    seedLobby(playTo('choosing'))
    asUser(DRAWER)

    const response = await post()

    expect(response.status).toBe(403)
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
  })

  it('lets the drawer talk again at the reveal, when the word is on every screen', async () => {
    seedLobby(playTo('reveal'))
    asUser(DRAWER)

    const response = await post()

    expect(response.status).toBe(200)
    expect(mockBroadcastToLobby).toHaveBeenCalledTimes(1)
  })

  it('never gets in a guesser way – this is a party game and the talking is the point', async () => {
    seedLobby(playTo('drawing'))
    asUser(GUESSER)

    const response = await post()

    expect(response.status).toBe(200)
    expect(mockPersistChatMessage).toHaveBeenCalledTimes(1)
  })

  it('reads no game state at all for any other game type', async () => {
    seedLobby(playTo('drawing'), 'tic_tac_toe')
    asUser(DRAWER)

    const response = await post()

    expect(response.status).toBe(200)
    // The extra query is the cost of this rule, and only this game pays it.
    expect(prisma.games.findUnique).not.toHaveBeenCalled()
  })

  // #1082: a guesser who already has the word knows it as well as the drawer does.
  function solvedDrawingState() {
    const game = new SketchAndGuessGame('game-123', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
    game.addPlayer({ id: DRAWER, name: 'Host' })
    game.addPlayer({ id: GUESSER, name: 'Bea' })
    game.addPlayer({ id: THIRD, name: 'Cyd' })
    game.startGame()
    const choices = (game.getState().data as { rounds: Array<{ wordChoices: Array<{ id: string; en: string[] }> }> }).rounds[0].wordChoices
    game.makeMove({ playerId: DRAWER, type: 'choose-word', data: { wordId: choices[0].id }, timestamp: new Date() })
    game.makeMove({ playerId: GUESSER, type: 'submit-guess', data: { guess: choices[0].en[0] }, timestamp: new Date() })
    return { state: game.getState(), word: choices[0].en[0] }
  }

  it('mutes a guesser who has already got the word until the reveal (#1082)', async () => {
    seedLobby(solvedDrawingState().state)
    asUser(GUESSER)

    const response = await post()
    const body = (await response.json()) as { code?: string }

    expect(response.status).toBe(403)
    expect(body.code).toBe('SOLVER_CHAT_MUTED')
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
  })

  it('refuses a message that spells the word, from anyone, while it is drawn (#1082)', async () => {
    const { state, word } = solvedDrawingState()
    seedLobby(state)
    asUser(THIRD)

    const response = await POST(
      new NextRequest('http://localhost:3000/api/lobby/ABCD12/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `is it a ${word.toUpperCase()}?` }),
      }),
      { params: Promise.resolve({ code: 'ABCD12' }) }
    )
    const body = (await response.json()) as { code?: string }

    expect(response.status).toBe(403)
    expect(body.code).toBe('WORD_IN_CHAT')
    expect(mockPersistChatMessage).not.toHaveBeenCalled()
  })

  it('still lets a guesser without the word chat normally (#1082)', async () => {
    seedLobby(solvedDrawingState().state)
    asUser(THIRD)

    const response = await post()

    expect(response.status).toBe(200)
  })
})
