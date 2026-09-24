/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/security/csp-report/route'
import { parseCspViolationBody, recordCspViolationReport } from '@/lib/csp-report'

jest.mock('@/lib/csp-report', () => ({
  parseCspViolationBody: jest.fn(),
  recordCspViolationReport: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  // The returned limiter answers per-request from a header a test can set, rather than a
  // fixed value, so a single mock module covers both the "allowed" and "blocked" paths
  // without reaching into Jest's module registry.
  rateLimit: jest.fn((config: { windowMs: number; maxRequests: number }) => {
    return async (req: { headers: { get(name: string): string | null } }) => {
      if (req.headers.get('x-test-force-rate-limited') === '1') {
        return new Response(JSON.stringify({ error: 'Too many CSP reports' }), { status: 429 })
      }
      return null
    }
  }),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockParse = parseCspViolationBody as jest.Mock
const mockRecord = recordCspViolationReport as jest.Mock

// The route builds its limiter once at module load (`const limiter = rateLimit({...})`),
// before any `beforeEach` runs — capture that call now, since `jest.clearAllMocks()` below
// would otherwise erase it before a test gets to look.
const rateLimitConfigAtLoad = jest.requireMock('@/lib/rate-limit').rateLimit.mock.calls[0]?.[0]

function reportRequest(body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body)
  return new NextRequest('http://localhost:3000/api/security/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report', ...headers },
    body: text,
  })
}

describe('POST /api/security/csp-report', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('records a recognised report and answers 204 with no body', async () => {
    mockParse.mockReturnValue({ documentUri: 'https://boardly.online/games' })

    const response = await POST(reportRequest({ 'csp-report': {} }))

    expect(response.status).toBe(204)
    expect(mockRecord).toHaveBeenCalledWith({ documentUri: 'https://boardly.online/games' })
  })

  it('answers 204 without recording anything for an unrecognised shape', async () => {
    mockParse.mockReturnValue(null)

    const response = await POST(reportRequest({ nonsense: true }))

    expect(response.status).toBe(204)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('answers 204 without throwing on an invalid JSON body', async () => {
    const request = new NextRequest('http://localhost:3000/api/security/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: '{not json',
    })

    const response = await POST(request)

    expect(response.status).toBe(204)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('rejects a body larger than the declared Content-Length cap with 413', async () => {
    const request = reportRequest({ 'csp-report': {} }, { 'content-length': '999999' })

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('rejects an oversized body even when Content-Length lies about it', async () => {
    const hugeSample = 'x'.repeat(30_000)
    const request = reportRequest(
      { 'csp-report': { 'script-sample': hugeSample } },
      { 'content-length': '10' }
    )

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('is rate limited before parsing or recording anything', async () => {
    const response = await POST(reportRequest({ 'csp-report': {} }, { 'x-test-force-rate-limited': '1' }))

    expect(response.status).toBe(429)
    expect(mockParse).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('configures a windowed, capped limiter rather than an unbounded one', () => {
    expect(rateLimitConfigAtLoad).toMatchObject({
      windowMs: expect.any(Number),
      maxRequests: expect.any(Number),
    })
  })
})
