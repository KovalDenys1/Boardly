/**
 * #1142 in lib/next-auth.ts:
 * - events.linkAccount marks the address verified only when the provider vouched for
 *   it and it is the account's own address, and never touches the username;
 * - callbacks.signIn follows the same rule for a returning OAuth user;
 * - the credentials authorize runs one bcrypt comparison on every path, so response
 *   time does not reveal which addresses have a password account, and still lets in
 *   exactly who it let in before.
 */
// @ts-nocheck

jest.mock('next-auth/jwt', () => ({
  encode: jest.fn(),
  decode: jest.fn(),
}))
jest.mock('next-auth/providers/google', () => jest.fn(() => ({ id: 'google' })))
jest.mock('next-auth/providers/github', () => jest.fn(() => ({ id: 'github' })))
jest.mock('next-auth/providers/discord', () => jest.fn(() => ({ id: 'discord' })))
jest.mock('next-auth/providers/credentials', () => jest.fn((options) => ({ id: 'credentials', ...options })))
jest.mock('@/lib/custom-prisma-adapter', () => ({ CustomPrismaAdapter: jest.fn(() => ({})) }))
jest.mock('@/lib/auth', () => ({ comparePassword: jest.fn() }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    accounts: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { comparePassword } from '@/lib/auth'
import { authOptions } from '@/lib/next-auth'

const update = prisma.users.update as jest.Mock
const findFirst = prisma.users.findFirst as jest.Mock
const findAccount = prisma.accounts.findUnique as jest.Mock
const compare = comparePassword as jest.Mock

const linkAccount = authOptions.events!.linkAccount!
const signIn = authOptions.callbacks!.signIn!
const authorize = (authOptions.providers.find((p) => p.id === 'credentials') as { authorize: Function }).authorize

beforeEach(() => {
  jest.clearAllMocks()
})

describe('events.linkAccount', () => {
  const account = { provider: 'discord', providerAccountId: 'd-1', type: 'oauth' }

  it('leaves an unverified Discord address unverified and the username alone', async () => {
    await linkAccount({
      user: { id: 'u1', email: 'jane@example.com', emailVerified: null, name: 'Jane_Doe' },
      account,
      profile: { id: 'd-1', email: 'jane@example.com', providerEmailVerified: false },
    })

    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { image: null } })
  })

  it('marks the address verified when the provider vouched for that same address', async () => {
    await linkAccount({
      user: { id: 'u1', email: 'jane@example.com', emailVerified: null },
      account: { ...account, provider: 'google' },
      profile: { id: 'g-1', email: 'Jane@Example.com', providerEmailVerified: true },
    })

    const { data } = update.mock.calls[0][0]
    expect(data.emailVerified).toBeInstanceOf(Date)
    expect(data).not.toHaveProperty('username')
  })

  it('does not verify the account’s address because a provider verified a different one', async () => {
    await linkAccount({
      user: { id: 'u1', email: 'jane@example.com', emailVerified: null, name: 'Jane' },
      account: { ...account, provider: 'google' },
      profile: { id: 'g-1', email: 'jane.work@example.org', providerEmailVerified: true },
    })

    expect(update.mock.calls[0][0].data).toEqual({ image: null })
  })

  it('keeps an existing verification date', async () => {
    const since = new Date('2026-01-01T00:00:00Z')
    await linkAccount({
      user: { id: 'u1', email: 'jane@example.com', emailVerified: since },
      account: { ...account, provider: 'google' },
      profile: { id: 'g-1', email: 'jane@example.com', providerEmailVerified: true },
    })

    expect(update.mock.calls[0][0].data).toEqual({ image: null })
  })
})

describe('callbacks.signIn for a returning OAuth user', () => {
  function existingAccount(user) {
    findAccount.mockResolvedValue({ id: 'acc-1', userId: 'u1', user: { suspended: false, ...user } })
  }

  it('does not mark an unverified Discord address verified', async () => {
    existingAccount({ email: 'jane@example.com', emailVerified: null })

    const result = await signIn({
      user: { id: 'u1' },
      account: { provider: 'discord', providerAccountId: 'd-1', type: 'oauth' },
      profile: { id: 'd-1', email: 'jane@example.com', verified: false },
    })

    expect(result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('marks it verified when Discord says it is verified and it is the account’s address', async () => {
    existingAccount({ email: 'jane@example.com', emailVerified: null })

    await signIn({
      user: { id: 'u1' },
      account: { provider: 'discord', providerAccountId: 'd-1', type: 'oauth' },
      profile: { id: 'd-1', email: 'jane@example.com', verified: true },
    })

    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailVerified: expect.any(Date) } })
  })

  it('still lets the user in either way', async () => {
    existingAccount({ email: 'jane@example.com', emailVerified: null })
    const result = await signIn({
      user: { id: 'u1' },
      account: { provider: 'google', providerAccountId: 'g-1', type: 'oauth' },
      profile: { sub: 'g-1', email: 'other@example.com', email_verified: true },
    })
    expect(result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})

describe('credentials authorize', () => {
  const credentials = { email: 'jane@example.com', password: 'Secret123', rememberMe: 'true' }

  it('runs a bcrypt comparison for an unknown address', async () => {
    findFirst.mockResolvedValue(null)
    compare.mockResolvedValue(false)

    await expect(authorize(credentials)).resolves.toBeNull()
    expect(compare).toHaveBeenCalledTimes(1)
    expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/)
  })

  it('runs one for an account without a password, and refuses it', async () => {
    findFirst.mockResolvedValue({ id: 'u1', email: 'jane@example.com', passwordHash: null, suspended: false })
    compare.mockResolvedValue(true)

    await expect(authorize(credentials)).resolves.toBeNull()
    expect(compare).toHaveBeenCalledTimes(1)
  })

  it('runs one for a suspended account, and refuses it even with the right password', async () => {
    findFirst.mockResolvedValue({ id: 'u1', email: 'jane@example.com', passwordHash: '$2b$10$real', suspended: true })
    compare.mockResolvedValue(true)

    await expect(authorize(credentials)).resolves.toBeNull()
    expect(compare).toHaveBeenCalledWith('Secret123', '$2b$10$real')
  })

  it('refuses a wrong password', async () => {
    findFirst.mockResolvedValue({ id: 'u1', email: 'jane@example.com', passwordHash: '$2b$10$real', suspended: false })
    compare.mockResolvedValue(false)

    await expect(authorize(credentials)).resolves.toBeNull()
  })

  it('lets the right password in, as before', async () => {
    findFirst.mockResolvedValue({
      id: 'u1',
      email: 'jane@example.com',
      username: 'jane',
      passwordHash: '$2b$10$real',
      suspended: false,
      emailVerified: null,
      role: 'user',
    })
    compare.mockResolvedValue(true)

    await expect(authorize(credentials)).resolves.toEqual(expect.objectContaining({ id: 'u1', email: 'jane@example.com' }))
    expect(compare).toHaveBeenCalledWith('Secret123', '$2b$10$real')
  })
})
