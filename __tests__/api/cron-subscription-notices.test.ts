/**
 * @jest-environment @edge-runtime/jest-environment
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { GET } from '@/app/api/cron/subscription-notices/route'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { sendDueSubscriptionNotices } from '@/lib/subscription-notice'

jest.mock('@/lib/subscription-notice', () => ({
  sendDueSubscriptionNotices: jest.fn(),
}))

jest.mock('@/lib/cron-heartbeat', () => ({
  recordCronRun: jest.fn(),
}))

jest.mock('@/lib/cron-auth', () => ({
  authorizeCronRequest: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockAuthorize = authorizeCronRequest as jest.MockedFunction<typeof authorizeCronRequest>
const mockSendDue = sendDueSubscriptionNotices as jest.MockedFunction<typeof sendDueSubscriptionNotices>
const mockRecordCronRun = recordCronRun as jest.MockedFunction<typeof recordCronRun>

const url = 'http://localhost:3000/api/cron/subscription-notices'

describe('GET /api/cron/subscription-notices (#1165)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthorize.mockReturnValue(null)
  })

  it('refuses a request without the cron secret and sends nothing', async () => {
    mockAuthorize.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await GET(new NextRequest(url))

    expect(response.status).toBe(401)
    expect(mockSendDue).not.toHaveBeenCalled()
  })

  it('runs the notices and leaves the summary in the heartbeat', async () => {
    const summary = { candidates: 2, sent: 1, notDue: 1, notRunning: 0, failed: 0 }
    mockSendDue.mockResolvedValue(summary)

    const response = await GET(new NextRequest(url))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ success: true, ...summary })
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      expect.objectContaining({ cron: 'subscription-notices', success: true, payload: summary })
    )
  })

  it('records a failed run', async () => {
    mockSendDue.mockRejectedValue(new Error('database down'))

    const response = await GET(new NextRequest(url))

    expect(response.status).toBe(500)
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      expect.objectContaining({ cron: 'subscription-notices', success: false, reason: 'database down' })
    )
  })

  it('is scheduled daily in vercel.json', () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    expect(config.crons).toContainEqual({ path: '/api/cron/subscription-notices', schedule: '0 5 * * *' })
  })
})
