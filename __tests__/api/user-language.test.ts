/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { PUT } from '@/app/api/user/language/route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: { users: { findUnique: jest.fn(), updateMany: jest.fn() } },
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))

function put(body: unknown) {
  return PUT(
    new NextRequest('https://boardly.online/api/user/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

describe('PUT /api/user/language (#1331)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getServerSession.mockResolvedValue({ user: { id: 'user-1', suspended: false } })
    prisma.users.updateMany.mockResolvedValue({ count: 1 })
  })

  it('stores a site locale on the signed-in account, only when it differs', async () => {
    const response = await put({ language: 'no' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ language: 'no', changed: true })
    expect(prisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', isGuest: false, OR: [{ language: null }, { language: { not: 'no' } }] },
      data: { language: 'no' },
    })
  })

  it('answers unchanged when the account already holds that locale', async () => {
    prisma.users.updateMany.mockResolvedValue({ count: 0 })

    await expect((await put({ language: 'en' })).json()).resolves.toEqual({ language: 'en', changed: false })
  })

  it('refuses anything that is not a site locale', async () => {
    for (const language of ['nb', 'de', '', null, 42]) {
      expect((await put({ language })).status).toBe(400)
    }
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a visitor who is not signed in', async () => {
    getServerSession.mockResolvedValue(null)

    expect((await put({ language: 'no' })).status).toBe(401)
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })
})
