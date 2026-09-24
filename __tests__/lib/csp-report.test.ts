// @ts-nocheck

import { parseCspViolationBody, recordCspViolationReport } from '@/lib/csp-report'
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

describe('parseCspViolationBody', () => {
  it('parses a legacy report-uri body', () => {
    const fields = parseCspViolationBody({
      'csp-report': {
        'document-uri': 'https://boardly.online/games',
        'violated-directive': "script-src 'self'",
        'effective-directive': 'script-src',
        'blocked-uri': 'inline',
        disposition: 'report',
        'script-sample': 'console.log(1)',
        'status-code': 200,
      },
    })

    expect(fields).toMatchObject({
      documentUri: 'https://boardly.online/games',
      violatedDirective: "script-src 'self'",
      effectiveDirective: 'script-src',
      blockedUri: 'inline',
      disposition: 'report',
      sample: 'console.log(1)',
      statusCode: 200,
    })
  })

  it('parses a Reporting API (report-to) batch, taking the first csp-violation entry', () => {
    const fields = parseCspViolationBody([
      { type: 'deprecation', body: {} },
      {
        type: 'csp-violation',
        url: 'https://boardly.online/games',
        body: {
          documentURL: 'https://boardly.online/games',
          effectiveDirective: 'script-src',
          blockedURL: 'inline',
          disposition: 'enforce',
          sample: 'x',
          statusCode: 200,
        },
      },
    ])

    expect(fields).toMatchObject({
      documentUri: 'https://boardly.online/games',
      violatedDirective: 'script-src',
      effectiveDirective: 'script-src',
      blockedUri: 'inline',
      disposition: 'enforce',
    })
  })

  it('returns null for a shape it does not recognise', () => {
    expect(parseCspViolationBody({ hello: 'world' })).toBeNull()
    expect(parseCspViolationBody([{ type: 'deprecation', body: {} }])).toBeNull()
    expect(parseCspViolationBody(null)).toBeNull()
  })

  it('truncates an overlong field instead of keeping it whole', () => {
    const longSample = 'x'.repeat(2000)
    const fields = parseCspViolationBody({
      'csp-report': { 'document-uri': 'https://boardly.online/', 'script-sample': longSample },
    })

    expect(fields?.sample?.length).toBeLessThan(600)
  })
})

describe('recordCspViolationReport', () => {
  const mockCreate = prisma.operationalEvents.create as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('writes a csp_violation_reported row with the parsed fields', async () => {
    await recordCspViolationReport({
      documentUri: 'https://boardly.online/games',
      violatedDirective: "script-src 'self'",
      blockedUri: 'inline',
      disposition: 'report',
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: 'csp_violation_reported',
        metricType: 'alert_signal',
        reason: "script-src 'self'",
        payload: expect.objectContaining({
          document_uri: 'https://boardly.online/games',
          blocked_uri: 'inline',
          disposition: 'report',
        }),
      }),
    })
  })

  it('never throws when the database write fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db down'))

    await expect(recordCspViolationReport({ documentUri: 'x' })).resolves.toBeUndefined()
  })
})
