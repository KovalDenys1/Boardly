import { createHmac } from 'node:crypto'
import { __participantKeyForTests, participantKeys, recordLobbyParticipation } from '@/lib/lobby-participation'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbyParticipations: { create: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
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
  const JOINED_AT = new Date('2026-09-15T10:00:00.000Z')
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
    ;(prisma.lobbyParticipations.create as jest.Mock).mockResolvedValue({ joinedAt: JOINED_AT })
  })
  afterAll(() => { process.env.PARTICIPATION_HASH_SALT = OLD })

  it('writes the event when the row it created is the second non-bot participant', async () => {
    ;(prisma.lobbyParticipations.count as jest.Mock).mockResolvedValue(2)

    await expect(recordLobbyParticipation(base)).resolves.toBe(true)

    expect(prisma.lobbyParticipations.count).toHaveBeenCalledWith({
      where: { lobbyId: 'lobby-1', isBot: false, joinedAt: { lte: JOINED_AT } },
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

  it('fires exactly once when two humans join at the same time', async () => {
    // Host row is in place; B and C both insert before either counts. The count is
    // bounded by each caller's own joinedAt, so B sees host+B and C sees all three.
    const earlier = new Date('2026-09-15T10:00:00.100Z')
    const later = new Date('2026-09-15T10:00:00.250Z')
    ;(prisma.lobbyParticipations.create as jest.Mock)
      .mockResolvedValueOnce({ joinedAt: earlier })
      .mockResolvedValueOnce({ joinedAt: later })
    ;(prisma.lobbyParticipations.count as jest.Mock).mockImplementation(
      async ({ where }: { where: { joinedAt: { lte: Date } } }) =>
        [JOINED_AT, earlier, later].filter((t) => t <= where.joinedAt.lte).length,
    )

    await Promise.all([
      recordLobbyParticipation(base),
      recordLobbyParticipation({ ...base, userId: 'user-3' }),
    ])

    expect(prisma.lobbyParticipations.count).toHaveBeenCalledWith({
      where: { lobbyId: 'lobby-1', isBot: false, joinedAt: { lte: earlier } },
    })
    expect(prisma.lobbyParticipations.count).toHaveBeenCalledWith({
      where: { lobbyId: 'lobby-1', isBot: false, joinedAt: { lte: later } },
    })
    expect(prisma.operationalEvents.create).toHaveBeenCalledTimes(1)
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

describe('PARTICIPATION_HASH_SALT transition off NEXTAUTH_SECRET (#1142, #1149)', () => {
  const originalEnv = process.env
  const NEXTAUTH = 'test-nextauth-secret-at-least-32-characters'
  const SALT = 'test-participation-salt-at-least-32-characters'
  const DURING = new Date('2026-10-01T12:00:00.000Z')
  const CUTOFF = new Date('2026-12-27T00:00:00.000Z')
  const base = { lobbyId: 'lobby-1', lobbyCode: 'AB12', gameType: 'yahtzee' as const, userId: 'user-1' }

  const hash = (salt: string, userId: string) =>
    createHmac('sha256', salt).update(userId).digest('hex').slice(0, 32)

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, NEXTAUTH_SECRET: NEXTAUTH }
    delete process.env.PARTICIPATION_HASH_SALT
    ;(prisma.lobbyParticipations.create as jest.Mock).mockResolvedValue({ joinedAt: DURING })
    ;(prisma.lobbyParticipations.count as jest.Mock).mockResolvedValue(1)
    ;(prisma.lobbyParticipations.findFirst as jest.Mock).mockResolvedValue(null)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('without PARTICIPATION_HASH_SALT', () => {
    it.each([
      ['during the transition', DURING],
      ['after the cutoff', new Date('2027-02-01T00:00:00.000Z')],
    ])('hashes with NEXTAUTH_SECRET alone %s and looks nothing else up', async (_label, now) => {
      jest.useFakeTimers({ now })

      expect(participantKeys('user-1')).toEqual([hash(NEXTAUTH, 'user-1')])
      await expect(recordLobbyParticipation(base)).resolves.toBe(true)

      expect(prisma.lobbyParticipations.findFirst).not.toHaveBeenCalled()
      expect(prisma.lobbyParticipations.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ participantKey: hash(NEXTAUTH, 'user-1') }) })
      )
    })
  })

  describe('with PARTICIPATION_HASH_SALT', () => {
    beforeEach(() => {
      process.env.PARTICIPATION_HASH_SALT = SALT
    })

    it('writes the new-salt key, and looks up the old-salt one during the transition', async () => {
      jest.useFakeTimers({ now: DURING })

      expect(participantKeys('user-1')).toEqual([hash(SALT, 'user-1'), hash(NEXTAUTH, 'user-1')])
      await expect(recordLobbyParticipation(base)).resolves.toBe(true)

      expect(prisma.lobbyParticipations.findFirst).toHaveBeenCalledWith({
        where: { lobbyId: 'lobby-1', participantKey: { in: [hash(NEXTAUTH, 'user-1')] } },
        select: { id: true },
      })
      expect(prisma.lobbyParticipations.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ participantKey: hash(SALT, 'user-1') }) })
      )
    })

    it('treats a rejoin recorded under the old salt as the duplicate it is', async () => {
      // Joined before the salt was set; the unique index cannot see it under the new key.
      jest.useFakeTimers({ now: DURING })
      ;(prisma.lobbyParticipations.findFirst as jest.Mock).mockResolvedValue({ id: 'row-before-the-switch' })
      ;(prisma.lobbyParticipations.count as jest.Mock).mockResolvedValue(2)

      await expect(recordLobbyParticipation(base)).resolves.toBe(false)

      expect(prisma.lobbyParticipations.create).not.toHaveBeenCalled()
      expect(prisma.operationalEvents.create).not.toHaveBeenCalled()
    })

    it('still dedupes a rejoin under the new salt through the unique index', async () => {
      jest.useFakeTimers({ now: DURING })
      ;(prisma.lobbyParticipations.create as jest.Mock).mockRejectedValue({ code: 'P2002' })

      await expect(recordLobbyParticipation(base)).resolves.toBe(false)
    })

    it('stops looking up the old-salt key from the cutoff on', async () => {
      jest.useFakeTimers({ now: CUTOFF })

      expect(participantKeys('user-1')).toEqual([hash(SALT, 'user-1')])
      await expect(recordLobbyParticipation(base)).resolves.toBe(true)

      expect(prisma.lobbyParticipations.findFirst).not.toHaveBeenCalled()
      expect(prisma.lobbyParticipations.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ participantKey: hash(SALT, 'user-1') }) })
      )
    })

    it('never throws when the old-salt lookup fails', async () => {
      jest.useFakeTimers({ now: DURING })
      ;(prisma.lobbyParticipations.findFirst as jest.Mock).mockRejectedValue(new Error('db down'))

      await expect(recordLobbyParticipation(base)).resolves.toBe(false)
    })
  })
})
