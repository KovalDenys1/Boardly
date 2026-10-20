/**
 * @jest-environment node
 */

/**
 * POST /api/game/[gameId]/sketch-live-key is the one place a live-stroke key
 * gets the server's word behind it. It must certify the current drawer during
 * the drawing phase and nobody else: not another player, not a player who has
 * already guessed, not a spectator, and not the drawer outside the drawing phase.
 */

import { webcrypto } from 'crypto'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/sketch-live-key/route'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import type { SketchWord } from '@/lib/games/sketch-and-guess-words'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { __resetRealtimeVerifierForTests, verifyRealtimeSeal } from '@/lib/client/realtime-verify'
import { SKETCH_LIVE_KEY_EVENT } from '@/lib/sketch-live'
import { installSignedRealtime } from '@/__tests__/fixtures/signed-realtime'

jest.mock('@/lib/db', () => ({ prisma: { games: { findUnique: jest.fn() } } }))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

installSignedRealtime()

const DRAWER = 'user-drawer'
const GUESSER = 'user-guesser'
const SOLVER = 'user-solver'
const SPECTATOR = 'user-spectator'
const TOPIC = 'lobby:4321:lobby-realtime-secret'

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

function drawingRound(phase: 'choosing' | 'drawing' = 'drawing') {
  const game = new SketchAndGuessGame('game-9', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
  game.addPlayer({ id: DRAWER, name: 'Dee' })
  game.addPlayer({ id: GUESSER, name: 'Gus' })
  game.addPlayer({ id: SOLVER, name: 'Sol' })
  game.startGame()
  if (phase === 'choosing') return game.getState()

  const word: SketchWord = { id: 'castle', en: ['castle'], no: ['slott'], ru: ['замок'], uk: ['замок'] }
  const state = game.getState() as { data: { rounds: Array<{ wordChoices: SketchWord[] }> } }
  state.data.rounds[0].wordChoices = [word]
  game.restoreState(state as never)
  game.makeMove({ playerId: DRAWER, type: 'choose-word', data: { wordId: word.id }, timestamp: new Date() })
  game.makeMove({ playerId: SOLVER, type: 'submit-guess', data: { guess: 'castle' }, timestamp: new Date(Date.now() + 1000) })
  return game.getState()
}

function seed(state: unknown, status = 'playing') {
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-9',
    status,
    gameType: 'sketch_and_guess',
    state: JSON.stringify(state),
    lobby: { code: '4321', gameType: 'sketch_and_guess', realtimeSecret: 'lobby-realtime-secret' },
  })
}

async function publicKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey)
  return { x: jwk.x as string, y: jwk.y as string }
}

async function ask(asUserId: string | null, body: unknown) {
  mockGetRequestAuthUser.mockResolvedValue(asUserId ? ({ id: asUserId } as never) : null)
  const res = await POST(
    new NextRequest('http://localhost:3000/api/game/game-9/sketch-live-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ gameId: 'game-9' }) }
  )
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  jest.clearAllMocks()
  __resetRealtimeVerifierForTests()
})

describe('POST /api/game/[gameId]/sketch-live-key', () => {
  it("certifies the drawer's key for this round of this game on this lobby's topic", async () => {
    const state = drawingRound()
    seed(state)
    const key = await publicKey()

    const res = await ask(DRAWER, key)

    expect(res.status).toBe(200)
    expect(await verifyRealtimeSeal(TOPIC, SKETCH_LIVE_KEY_EVENT, res.body.cert))
      .toEqual({ gameId: 'game-9', round: 1, drawerId: DRAWER, x: key.x, y: key.y })
  })

  it.each([
    ['another player', GUESSER],
    ['a player who has already guessed', SOLVER],
    ['a spectator', SPECTATOR],
  ])('refuses %s', async (_who, userId) => {
    seed(drawingRound())
    const res = await ask(userId, await publicKey())
    expect(res.status).toBe(403)
    expect(res.body.cert).toBeUndefined()
  })

  it('refuses the drawer while the word is still being chosen, and once the game is over', async () => {
    seed(drawingRound('choosing'))
    expect((await ask(DRAWER, await publicKey())).status).toBe(403)

    seed(drawingRound(), 'finished')
    expect((await ask(DRAWER, await publicKey())).status).toBe(409)
  })

  it('refuses a caller with no session, and a key that is not a P-256 point', async () => {
    seed(drawingRound())
    expect((await ask(null, await publicKey())).status).toBe(401)
    expect((await ask(DRAWER, { x: 'A'.repeat(43), y: 'B'.repeat(43) })).status).toBe(400)
    expect((await ask(DRAWER, { x: 1, y: 2 })).status).toBe(400)
  })
})
