/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST, MAX_OPS_EVENT_BODY_BYTES } from '@/app/api/ops/events/route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    operationalEvents: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/rate-limit', () => {
  const limiter = jest.fn(() => Promise.resolve(null))
  return {
    rateLimit: jest.fn(() => limiter),
    __limiter: limiter,
  }
})

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const rateLimiterMock = (jest.requireMock('@/lib/rate-limit') as { __limiter: jest.Mock }).__limiter

function buildRequest(rawBody: string) {
  return new NextRequest('http://localhost:3000/api/ops/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  })
}

describe('POST /api/ops/events', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    rateLimiterMock.mockImplementation(() => Promise.resolve(null))
    mockPrisma.operationalEvents.create.mockResolvedValue({} as any)
  })

  it('accepts a normal telemetry event', async () => {
    const response = await POST(
      buildRequest(JSON.stringify({ eventName: 'lobby_create_ready', payload: { source: 'home' } }))
    )

    expect(response.status).toBe(200)
    expect(mockPrisma.operationalEvents.create).toHaveBeenCalled()
  })

  // #1118 (audit S2-03): the ticket's own acceptance case — 50 keys.
  it('returns 400 for a payload with more than 20 keys', async () => {
    const payload: Record<string, string> = {}
    for (let i = 0; i < 50; i += 1) {
      payload[`key${i}`] = 'v'
    }

    const response = await POST(
      buildRequest(JSON.stringify({ eventName: 'lobby_create_ready', payload }))
    )

    expect(response.status).toBe(400)
    expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('returns 400 for a payload key longer than 64 characters', async () => {
    const response = await POST(
      buildRequest(
        JSON.stringify({
          eventName: 'lobby_create_ready',
          payload: { ['k'.repeat(65)]: 'v' },
        })
      )
    )

    expect(response.status).toBe(400)
    expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('returns 400 for a string value longer than 256 characters', async () => {
    const response = await POST(
      buildRequest(
        JSON.stringify({
          eventName: 'lobby_create_ready',
          payload: { source: 'v'.repeat(257) },
        })
      )
    )

    expect(response.status).toBe(400)
    expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  // #1118 (audit S2-03): the ticket's own acceptance case — a 10 KB payload.
  it('returns 400 for a body over the 4 KB cap, before it is parsed as JSON', async () => {
    const bigValue = 'v'.repeat(10 * 1024)
    const rawBody = JSON.stringify({ eventName: 'lobby_create_ready', payload: { source: bigValue } })
    expect(Buffer.byteLength(rawBody, 'utf8')).toBeGreaterThan(MAX_OPS_EVENT_BODY_BYTES)

    const response = await POST(buildRequest(rawBody))

    expect(response.status).toBe(400)
    expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('returns 400 for a declared Content-Length over the cap', async () => {
    const request = new NextRequest('http://localhost:3000/api/ops/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'content-length': String(MAX_OPS_EVENT_BODY_BYTES + 1),
      },
      body: JSON.stringify({ eventName: 'lobby_create_ready', payload: {} }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('is rate limited', async () => {
    const limited = new Response(JSON.stringify({ error: 'Too many telemetry events' }), { status: 429 })
    rateLimiterMock.mockImplementation(() => Promise.resolve(limited as any))

    const response = await POST(
      buildRequest(JSON.stringify({ eventName: 'lobby_create_ready', payload: {} }))
    )

    expect(response.status).toBe(429)
    expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
  })
})
