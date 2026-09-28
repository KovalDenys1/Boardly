/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are loose here

/**
 * #1258: POST /api/lobby refuses a premium lobby theme to a host without
 * Premium, but PATCH /api/lobby/[code] only checked that the theme id existed,
 * so a free host created the room with the free theme and switched to a paid one
 * from the waiting room. The same gate now applies on PATCH; a guest is never
 * Premium.
 */
import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/lobby/[code]/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { FREE_LOBBY_THEME, PREMIUM_LOBBY_THEMES } from '@/lib/lobby-themes'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: { findUnique: jest.fn(), update: jest.fn() },
    games: { update: jest.fn(), updateMany: jest.fn() },
    users: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn().mockResolvedValue(true) }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const PREMIUM_THEME = PREMIUM_LOBBY_THEMES[0]
const OTHER_PREMIUM_THEME = PREMIUM_LOBBY_THEMES[1]

function seedLobby(theme: string = FREE_LOBBY_THEME) {
  mockPrisma.lobbies.findUnique.mockResolvedValue({
    id: 'lobby-1',
    code: 'ABC123',
    creatorId: 'host-1',
    gameType: 'yahtzee',
    maxPlayers: 4,
    theme,
    games: [],
  } as any)
  mockPrisma.lobbies.update.mockImplementation(async ({ data }) => ({
    id: 'lobby-1',
    code: 'ABC123',
    maxPlayers: 4,
    allowSpectators: false,
    maxSpectators: 0,
    turnTimer: 60,
    theme: data.theme ?? theme,
    gameType: 'yahtzee',
  }))
}

function asHost({ isGuest = false, premiumUntil = null as Date | null } = {}) {
  ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'host-1', username: 'Host', isGuest })
  mockPrisma.users.findUnique.mockResolvedValue({ premiumUntil } as any)
}

async function patch(body: Record<string, unknown>) {
  const response = await PATCH(
    new NextRequest('http://localhost:3000/api/lobby/ABC123', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ code: 'ABC123' }) }
  )
  return { status: response.status, body: await response.json() }
}

describe('PATCH /api/lobby/[code] premium theme gate (#1258)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('has premium themes to test against', () => {
    expect(PREMIUM_THEME).toBeDefined()
    expect(OTHER_PREMIUM_THEME).toBeDefined()
  })

  it('refuses a premium theme to a host without Premium', async () => {
    asHost({ premiumUntil: null })
    seedLobby()
    const res = await patch({ theme: PREMIUM_THEME })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Premium required for custom lobby themes')
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('refuses one to a host whose Premium has run out', async () => {
    asHost({ premiumUntil: new Date(Date.now() - 60_000) })
    seedLobby()
    expect((await patch({ theme: PREMIUM_THEME })).status).toBe(403)
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('refuses one to a guest host, without asking the database', async () => {
    asHost({ isGuest: true, premiumUntil: new Date(Date.now() + 86_400_000) })
    seedLobby()
    expect((await patch({ theme: PREMIUM_THEME })).status).toBe(403)
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('refuses the switch even when it rides along with another setting', async () => {
    asHost({ premiumUntil: null })
    seedLobby()
    expect((await patch({ turnTimer: 60, theme: PREMIUM_THEME })).status).toBe(403)
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('lets a Premium host switch to a premium theme', async () => {
    asHost({ premiumUntil: new Date(Date.now() + 86_400_000) })
    seedLobby()
    const res = await patch({ theme: PREMIUM_THEME })
    expect(res.status).toBe(200)
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ theme: PREMIUM_THEME }) })
    )
  })

  it('lets a free host pick the free theme', async () => {
    asHost({ premiumUntil: null })
    seedLobby(PREMIUM_THEME)
    expect((await patch({ theme: FREE_LOBBY_THEME })).status).toBe(200)
  })

  it('does not count re-sending the theme the lobby already has as a switch', async () => {
    asHost({ premiumUntil: null })
    seedLobby(PREMIUM_THEME)
    expect((await patch({ turnTimer: 60, theme: PREMIUM_THEME })).status).toBe(200)
    // Moving to a different premium theme is a switch, though.
    expect((await patch({ theme: OTHER_PREMIUM_THEME })).status).toBe(403)
  })
})
