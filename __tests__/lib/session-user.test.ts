/**
 * @jest-environment @edge-runtime/jest-environment
 */
/**
 * The session wrapper every getServerSession route goes through (#1137, audit
 * S1-02): a suspended account is refused on its next request, not after the
 * next 30-minute token refresh.
 */
// @ts-nocheck

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: { users: { findUnique: jest.fn() } },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { AuthenticationError } from '@/lib/error-handler'
import {
  AccountSuspendedError,
  getSessionUserOrThrow,
  isWriteMethod,
  optionalSessionUser,
  requireSessionUser,
} from '@/lib/session-user'

const mockSession = getServerSession as jest.Mock
const findUnique = prisma.users.findUnique as jest.Mock

const GET = { method: 'GET' }
const POST = { method: 'POST' }

describe('getSessionUserOrThrow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findUnique.mockResolvedValue({ suspended: false })
  })

  it('rejects a request with no session', async () => {
    mockSession.mockResolvedValue(null)

    await expect(getSessionUserOrThrow(POST)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('rejects a suspended claim on every method, without a database read', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', suspended: true } })

    await expect(getSessionUserOrThrow(GET)).rejects.toBeInstanceOf(AccountSuspendedError)
    await expect(getSessionUserOrThrow(POST)).rejects.toBeInstanceOf(AccountSuspendedError)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('re-reads suspended from the database on a write, while the token still says active', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', suspended: false } })
    findUnique.mockResolvedValue({ suspended: true })

    await expect(getSessionUserOrThrow(POST)).rejects.toBeInstanceOf(AccountSuspendedError)
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { suspended: true } })
  })

  it('keeps a read on the claim alone', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', suspended: false } })

    const { user } = await getSessionUserOrThrow(GET)

    expect(user.id).toBe('u1')
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('treats a request without a method as a read', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } })

    await getSessionUserOrThrow()

    expect(findUnique).not.toHaveBeenCalled()
  })

  it('rejects a write from a session whose account no longer exists', async () => {
    mockSession.mockResolvedValue({ user: { id: 'gone' } })
    findUnique.mockResolvedValue(null)

    await expect(getSessionUserOrThrow(POST)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('lets a suspended account through where erasure must stay available', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', suspended: true } })
    findUnique.mockResolvedValue({ suspended: true })

    const { user } = await getSessionUserOrThrow(POST, { allowSuspended: true })

    expect(user.id).toBe('u1')
  })
})

describe('requireSessionUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('answers 401 with the body the routes always sent', async () => {
    mockSession.mockResolvedValue(null)

    const result = await requireSessionUser(POST)

    expect('response' in result).toBe(true)
    expect(result.response.status).toBe(401)
    expect(await result.response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('answers 403 ACCOUNT_SUSPENDED for a suspended account', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } })
    findUnique.mockResolvedValue({ suspended: true })

    const result = await requireSessionUser(POST)

    expect(result.response.status).toBe(403)
    expect(await result.response.json()).toEqual({
      error: 'Account suspended',
      code: 'ACCOUNT_SUSPENDED',
    })
  })

  it('rethrows anything that is not an auth failure', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } })
    findUnique.mockRejectedValue(new Error('db down'))

    await expect(requireSessionUser(POST)).rejects.toThrow('db down')
  })
})

describe('optionalSessionUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('gives a visitor a null session', async () => {
    mockSession.mockResolvedValue(null)

    expect(await optionalSessionUser(GET)).toEqual({ session: null })
  })

  it('refuses a suspended viewer', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', suspended: true } })

    const result = await optionalSessionUser(GET)

    expect(result.response.status).toBe(403)
  })
})

describe('isWriteMethod', () => {
  it('counts everything but GET, HEAD and OPTIONS as a write', () => {
    expect(isWriteMethod('GET')).toBe(false)
    expect(isWriteMethod('head')).toBe(false)
    expect(isWriteMethod('OPTIONS')).toBe(false)
    expect(isWriteMethod('POST')).toBe(true)
    expect(isWriteMethod('PATCH')).toBe(true)
    expect(isWriteMethod('PUT')).toBe(true)
    expect(isWriteMethod('DELETE')).toBe(true)
    expect(isWriteMethod(undefined)).toBe(false)
  })
})
