/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST as postState } from '@/app/api/game/[gameId]/state/route'
import { POST as postBotTurn } from '@/app/api/game/[gameId]/bot-turn/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { RockPaperScissorsGame, type RockPaperScissorsGameData } from '@/lib/games/rock-paper-scissors-game'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    games: { findUnique: jest.fn(), updateMany: jest.fn() },
    players: { update: jest.fn() },
    operationalEvents: { create: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn().mockResolvedValue(true) }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { game: {} },
}))
jest.mock('@/lib/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})

const HUMAN = 'human-1'
const BOT = 'bot-1'
const GAME_ID = 'game-rps'

interface Row {
  id: string
  state: unknown
  status: string
  currentTurn: number
  updatedAt: Date
  lastMoveAt: Date | null
  startedAt: Date
}

let row: Row
const originalFetch = global.fetch
const originalEnv = { ...process.env }
const botTurnCalls: Promise<Response>[] = []

function snapshot() {
  return {
    ...row,
    state: JSON.parse(JSON.stringify(row.state)),
    players: [
      { id: 'p-human', userId: HUMAN, score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, leftAt: null, user: { id: HUMAN, username: 'Human', bot: null } },
      { id: 'p-bot', userId: BOT, score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, leftAt: null, user: { id: BOT, username: 'Pattern Reader', bot: { id: 'b1', difficulty: 'medium' } } },
    ],
    lobby: { id: 'lobby-1', code: '2708', gameType: 'rock_paper_scissors', turnTimer: 60, creatorId: HUMAN },
  }
}

function startedState() {
  const engine = new RockPaperScissorsGame(GAME_ID)
  engine.addPlayer({ id: HUMAN, name: 'Human' })
  engine.addPlayer({ id: BOT, name: 'Pattern Reader' })
  engine.startGame()
  return JSON.parse(JSON.stringify(engine.getState()))
}

function rpsData(): RockPaperScissorsGameData {
  return (row.state as { data: RockPaperScissorsGameData }).data
}

async function pick(choice: string) {
  const response = await postState(
    new NextRequest(`http://localhost:3000/api/game/${GAME_ID}/state`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: GAME_ID, move: { type: 'submit-choice', playerId: HUMAN, data: { choice } }, userId: HUMAN }),
    }),
    { params: Promise.resolve({ gameId: GAME_ID }) },
  )
  expect(response.status).toBe(200)
  // The trigger runs after the response; wait for every bot turn it started.
  for (let i = 0; i < 20 && botTurnCalls.length === 0; i += 1) await new Promise((r) => setTimeout(r, 5))
  const calls = botTurnCalls.splice(0)
  return Promise.all(calls)
}

describe('Rock Paper Scissors against a bot, without the turn timer (#1364)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.BOARDLY_INTERNAL_SECRET = 'internal-secret'
    process.env.NEXTAUTH_URL = 'https://www.boardly.online'
    process.env.BOT_UX_DELAY_MS = '0'
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: HUMAN, username: 'Human', isGuest: true })

    const created = new Date('2026-10-08T09:14:00.000Z')
    row = { id: GAME_ID, state: startedState(), status: 'playing', currentTurn: 0, updatedAt: created, lastMoveAt: null, startedAt: created }

    ;(prisma.games.findUnique as jest.Mock).mockImplementation(async () => snapshot())
    ;(prisma.games.updateMany as jest.Mock).mockImplementation(async ({ where, data }) => {
      if (where.currentTurn !== row.currentTurn || where.updatedAt.getTime() !== row.updatedAt.getTime()) return { count: 0 }
      row = { ...row, ...data, state: JSON.parse(JSON.stringify(data.state)) }
      return { count: 1 }
    })
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (work) => work(prisma))
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.operationalEvents.create as jest.Mock).mockResolvedValue({})

    // Production's NEXTAUTH_URL is the www host, which 301s to the apex; fetch follows that as a GET.
    global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const target = new URL(String(url))
      if (target.pathname !== `/api/game/${GAME_ID}/bot-turn`) throw new Error(`unexpected fetch ${target}`)
      if (target.hostname === 'www.boardly.online') {
        const apex = `https://boardly.online${target.pathname}`
        if (init?.redirect === 'manual') return new Response(null, { status: 301, headers: { location: apex } })
        return new Response(null, { status: 405 })
      }
      const call = postBotTurn(new NextRequest(target, init as never), { params: Promise.resolve({ gameId: GAME_ID }) })
      botTurnCalls.push(call)
      return call
    }) as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
    process.env = originalEnv
  })

  it('the bot answers every pick, so each round reveals on the pick alone', async () => {
    for (let round = 1; round <= 3 && row.status === 'playing'; round += 1) {
      const responses = await pick('rock')
      expect(responses.map((r) => r.status)).toEqual([200])
      expect(rpsData().rounds).toHaveLength(round)
      expect(Object.keys(rpsData().rounds[round - 1].choices).sort()).toEqual([BOT, HUMAN].sort())
    }
  })
})
