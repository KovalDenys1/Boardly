/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/notifications/unsubscribe/route'
import {
  upsertNotificationPreferences,
  verifyNotificationUnsubscribeToken,
} from '@/lib/notification-preferences'

jest.mock('@/lib/notification-preferences', () => ({
  upsertNotificationPreferences: jest.fn(),
  verifyNotificationUnsubscribeToken: jest.fn(),
}))

const mockUpsert = upsertNotificationPreferences as jest.Mock
const mockVerify = verifyNotificationUnsubscribeToken as jest.Mock

function unsubscribeRequest(method: 'GET' | 'POST', token: string) {
  return new NextRequest(`http://localhost:3000/api/notifications/unsubscribe?token=${token}`, {
    method,
  })
}

describe('GET /api/notifications/unsubscribe', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('turns off the specific preference for an invalid-typed token', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', type: 'marketingConsent' })

    const response = await GET(unsubscribeRequest('GET', 'good-token'))

    expect(response.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith('user-1', { marketingConsent: false })
  })

  it('serves an HTML error page for an invalid token, never a JSON body', async () => {
    mockVerify.mockReturnValue(null)

    const response = await GET(unsubscribeRequest('GET', 'bad-token'))

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

// #1154: RFC 8058 one-click. A mail client POSTs here automatically with no page shown -
// the response must be machine-readable JSON, and the action must be identical to GET's.
describe('POST /api/notifications/unsubscribe (RFC 8058 one-click)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('withdraws marketing consent and answers JSON success with no HTML', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', type: 'marketingConsent' })

    const response = await POST(unsubscribeRequest('POST', 'good-token'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ success: true })
    expect(mockUpsert).toHaveBeenCalledWith('user-1', { marketingConsent: false })
  })

  it('answers 400 JSON, not HTML, for an invalid or expired token', async () => {
    mockVerify.mockReturnValue(null)

    const response = await POST(unsubscribeRequest('POST', 'bad-token'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBeTruthy()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('sets unsubscribedAll for an "all" token exactly like the GET path does', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', type: 'all' })

    await POST(unsubscribeRequest('POST', 'all-token'))

    expect(mockUpsert).toHaveBeenCalledWith('user-1', { unsubscribedAll: true })
  })
})
