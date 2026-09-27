/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { DELETE } from '@/app/api/user/linked-accounts/route'
import { prisma } from '@/lib/db'
import { LAST_SIGN_IN_METHOD_CODE } from '@/lib/linked-accounts'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    accounts: { delete: jest.fn() },
  },
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitPresets: { auth: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock('@/lib/discord/role-connection', () => ({
  clearRoleConnection: jest.fn(async () => ({ status: 'cleared' })),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

function unlink(provider: string) {
  return new NextRequest('http://localhost:3000/api/user/linked-accounts', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  })
}

/** Both reads of Users: the suspended check on a write, then the route's own lookup. */
function userRow(row: Record<string, unknown>) {
  mockPrisma.users.findUnique.mockResolvedValue({ id: 'user-1', suspended: false, ...row })
}

describe('/auth/link is gone (#1140)', () => {
  const root = process.cwd()

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(name) ? [full] : []
    })
  }

  it('has no page', () => {
    expect(existsSync(path.join(root, 'app/auth/link'))).toBe(false)
  })

  it('is not linked or navigated to from any source file', () => {
    const offenders = ['app', 'components', 'contexts', 'hooks', 'lib']
      .flatMap((dir) => sourceFiles(path.join(root, dir)))
      .filter((file) => /['"`]\/auth\/link/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('DELETE /api/user/linked-accounts (#1140)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', email: 'player@example.com' } })
    mockPrisma.accounts.delete.mockResolvedValue({})
  })

  it('keeps the only sign-in method and answers with a code the profile translates', async () => {
    userRow({ passwordHash: null, accounts: [{ provider: 'google', id: 'acc-1' }] })

    const response = await DELETE(unlink('google'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe(LAST_SIGN_IN_METHOD_CODE)
    // What the person can actually do, not a set-password page that does not exist.
    expect(body.error).toContain('Forgot password?')
    expect(body.error).not.toMatch(/set a password first/i)
    expect(mockPrisma.accounts.delete).not.toHaveBeenCalled()
  })

  it('removes a provider when a password is set', async () => {
    userRow({ passwordHash: 'hash', accounts: [{ provider: 'google', id: 'acc-1' }] })

    const response = await DELETE(unlink('google'))

    expect(response.status).toBe(200)
    expect(mockPrisma.accounts.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } })
  })

  it('removes one of two providers', async () => {
    userRow({
      passwordHash: null,
      accounts: [
        { provider: 'google', id: 'acc-1' },
        { provider: 'github', id: 'acc-2' },
      ],
    })

    const response = await DELETE(unlink('github'))

    expect(response.status).toBe(200)
    expect(mockPrisma.accounts.delete).toHaveBeenCalledWith({ where: { id: 'acc-2' } })
  })
})
