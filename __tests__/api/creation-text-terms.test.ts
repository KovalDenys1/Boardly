/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as createLobby } from '@/app/api/lobby/route'
import { POST as createGame } from '@/app/api/game/create/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { requiresTermsAcceptance } from '@/lib/terms-gate'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    games: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    players: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), delete: jest.fn(), update: jest.fn() },
    users: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/terms-gate', () => ({ requiresTermsAcceptance: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/public-game-access', () => ({
  ...jest.requireActual('@/lib/public-game-access'),
  isTemporarilyUnavailableGameType: jest.fn(() => false),
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {},
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockRequiresTerms = requiresTermsAcceptance as jest.MockedFunction<typeof requiresTermsAcceptance>

const HOST = 'guest-host'
const TEN_WORDS = ['apple', 'boat', 'castle', 'drum', 'eagle', 'flute', 'grape', 'harp', 'igloo', 'jelly']

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetRequestAuthUser.mockResolvedValue({ id: HOST, username: 'Host', suspended: false, isGuest: true })
  mockRequiresTerms.mockResolvedValue(true)
})

describe('text chosen at creation waits for the terms', () => {
  it('refuses a lobby with a name of its own before anything is created', async () => {
    const response = await createLobby(post('http://localhost:3000/api/lobby', { name: 'Friday night', gameType: 'yahtzee' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'TERMS_REQUIRED' }))
    expect(mockRequiresTerms).toHaveBeenCalledWith(HOST)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.lobbies.create).not.toHaveBeenCalled()
  })

  it('refuses a Sketch & Guess start that carries custom words', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({ id: 'lobby-1', code: 'ABCD', creatorId: HOST, games: [] })

    const response = await createGame(post('http://localhost:3000/api/game/create', {
      gameType: 'sketch_and_guess',
      lobbyId: 'lobby-1',
      config: { maxPlayers: 10, minPlayers: 3, rules: { customWords: TEN_WORDS, customWordsOnly: true } },
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'TERMS_REQUIRED' }))
    expect(prisma.games.create).not.toHaveBeenCalled()
    expect(prisma.games.update).not.toHaveBeenCalled()
  })
})
