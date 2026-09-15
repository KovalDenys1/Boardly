import { __participantKeyForTests, recordLobbyParticipation } from '@/lib/lobby-participation'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbyParticipations: { create: jest.fn(), count: jest.fn() },
    operationalEvents: { create: jest.fn() },
  },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

describe('participation key (#816)', () => {
  const OLD = process.env.PARTICIPATION_HASH_SALT

  beforeEach(() => { process.env.PARTICIPATION_HASH_SALT = 'test-salt' })
  afterAll(() => { process.env.PARTICIPATION_HASH_SALT = OLD })

  it('is stable for the same user, so a returning player can be counted once', () => {
    expect(__participantKeyForTests('user-1')).toBe(__participantKeyForTests('user-1'))
  })

  it('differs between users', () => {
    expect(__participantKeyForTests('user-1')).not.toBe(__participantKeyForTests('user-2'))
  })

  it('never contains the user id — the table must outlive the person, not identify them', () => {
    const key = __participantKeyForTests('guest-abc-123')
    expect(key).not.toContain('guest')
    expect(key).not.toContain('abc')
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('changes with the salt, so the hash cannot be reproduced without it', () => {
    const withTestSalt = __participantKeyForTests('user-1')
    process.env.PARTICIPATION_HASH_SALT = 'another-salt'
    expect(__participantKeyForTests('user-1')).not.toBe(withTestSalt)
  })
})

describe('second_human_joined (#920)', () => {
  const OLD = process.env.PARTICIPATION_HASH_SALT
  const base = {
    lobbyId: 'lobby-1',
    lobbyCode: 'AB12',
    gameType: 'yahtzee' as const,
    userId: 'user-2',
    isGuest: true,
    signupSource: 'ref:reddit.com',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.PARTICIPATION_HASH_SALT = 'test-salt'
    ;(prisma.lobbyParticipations.create as jest.Mock).mockResolvedValue({})
  })
  afterAll(() => { process.env.PARTICIPATION_HASH_SALT = OLD })

  it('writes the event when the row it created is the second non-bot participant', async () => {
    ;(prisma.lobbyParticipations.count as jest.Mock).mockResolvedValue(2)

    await expect(recordLobbyParticipation(base)).resolves.toBe(true)

    expect(prisma.lobbyParticipations.count).toHaveBeenCalledWith({
      where: { lobbyId: 'lobby-1', isBot: false },
    })
    expect(prisma.operationalEvents.create).toHaveBeenCalledTimes(1)
    expect(prisma.operationalEvents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: 'second_human_joined',
        metricType: 'flow',
        gameType: 'yahtzee',
        isGuest: true,
        source: 'ref:reddit.com',
        payload: { lobby_code: 'AB12' },
      }),
    })
  })

  it('writes nothing for the first human, or the third', async () => {
    ;(prisma.lobbyParticipations.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(3)

    await recordLobbyParticipation(base)
    await recordLobbyParticipation({ ...base, userId: 'user-3' })

    expect(prisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('ignores bots: a bot-filled lobby is not an invite that worked', async () => {
    await expect(recordLobbyParticipation({ ...base, isBot: true })).resolves.toBe(true)

    expect(prisma.lobbyParticipations.count).not.toHaveBeenCalled()
    expect(prisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('does not re-count a rejoin: the duplicate row created nothing', async () => {
    ;(prisma.lobbyParticipations.create as jest.Mock).mockRejectedValue({ code: 'P2002' })

    await expect(recordLobbyParticipation(base)).resolves.toBe(false)

    expect(prisma.lobbyParticipations.count).not.toHaveBeenCalled()
    expect(prisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('never throws when the event write fails', async () => {
    ;(prisma.lobbyParticipations.count as jest.Mock).mockResolvedValue(2)
    ;(prisma.operationalEvents.create as jest.Mock).mockRejectedValue(new Error('db down'))

    await expect(recordLobbyParticipation(base)).resolves.toBe(true)
  })
})
