import { checkOpenLobbyLimit } from '@/lib/lobby-limit'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: { lobbies: { findFirst: jest.fn() } },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const findFirst = (prisma as unknown as { lobbies: { findFirst: jest.Mock } }).lobbies.findFirst

describe('one open lobby per person (#907)', () => {
  beforeEach(() => findFirst.mockReset())

  it('clears the way when the creator has nothing open', async () => {
    findFirst.mockResolvedValue(null)
    await expect(checkOpenLobbyLimit('guest-1')).resolves.toEqual({ kind: 'clear' })
  })

  it('blocks a second lobby when a game is already playing', async () => {
    // The production case: one guest, four simultaneous bot games.
    findFirst.mockResolvedValue({ code: '4859' })
    await expect(checkOpenLobbyLimit('guest-1')).resolves.toEqual({ kind: 'blocked', lobbyCode: '4859' })
  })

  it('blocks a waiting room too, which is where the first draft leaked', async () => {
    // A lobby is `waiting` with one player for the whole window between being
    // created and someone joining — exactly when a second one gets made. An
    // exemption for "waiting with only the creator" exempted almost everything.
    findFirst.mockResolvedValue({ code: '1704' })
    await expect(checkOpenLobbyLimit('guest-1')).resolves.toEqual({ kind: 'blocked', lobbyCode: '1704' })
  })

  it('counts both waiting and playing, and nothing else', async () => {
    findFirst.mockResolvedValue(null)
    await checkOpenLobbyLimit('guest-1')
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          creatorId: 'guest-1',
          games: { some: { status: { in: ['waiting', 'playing'] } } },
        },
      })
    )
  })

  it('applies to guests, who create most lobbies', async () => {
    // The guard this replaces began `if (!requestUser.isGuest)`, so it did not
    // apply to the 87% of creations that are guests.
    findFirst.mockResolvedValue({ code: '4444' })
    await expect(checkOpenLobbyLimit('guest-990848c8')).resolves.toEqual({
      kind: 'blocked', lobbyCode: '4444',
    })
  })
})
