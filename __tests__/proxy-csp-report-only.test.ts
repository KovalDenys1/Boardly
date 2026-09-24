/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { proxy } from '@/proxy'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>

function directiveValue(header: string | null | undefined, directive: string): string | null {
  const part = (header ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry === directive || entry.startsWith(`${directive} `))
  return part ?? null
}

async function getResponse(url = 'http://localhost:3000/games') {
  const request = new NextRequest(url, { method: 'GET' })
  return proxy(request)
}

// #1145. This is visibility-only: it must never touch the enforced Content-Security-Policy
// header (covered separately by proxy-csp.test.ts, which still passes unmodified).
describe('proxy CSP-Report-Only policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as any)
  })

  it('leaves the enforced Content-Security-Policy header untouched', async () => {
    const response = await getResponse()
    const enforced = response.headers.get('Content-Security-Policy')

    expect(enforced).toContain("'unsafe-inline'")
    expect(enforced).not.toContain("'strict-dynamic'")
    expect(enforced).not.toMatch(/'nonce-[^']+'/)
  })

  it('ships a report-only policy with a nonce and strict-dynamic, and no unsafe-inline', async () => {
    const response = await getResponse()
    const reportOnly = response.headers.get('Content-Security-Policy-Report-Only')

    expect(reportOnly).toBeTruthy()
    const scriptSrc = directiveValue(reportOnly, 'script-src')
    expect(scriptSrc).toMatch(/'nonce-[a-f0-9]+'/)
    expect(scriptSrc).toContain("'strict-dynamic'")
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(reportOnly).toContain("object-src 'none'")
  })

  it('points report-to and report-uri at the same-origin reporting endpoint', async () => {
    const response = await getResponse()
    const reportOnly = response.headers.get('Content-Security-Policy-Report-Only')

    expect(reportOnly).toContain('report-to csp-endpoint')
    expect(reportOnly).toContain('report-uri http://localhost:3000/api/security/csp-report')
  })

  it('declares the reporting group via Reporting-Endpoints and the legacy Report-To header', async () => {
    const response = await getResponse()

    expect(response.headers.get('Reporting-Endpoints')).toBe(
      'csp-endpoint="http://localhost:3000/api/security/csp-report"'
    )

    const legacy = JSON.parse(response.headers.get('Report-To') ?? '{}')
    expect(legacy).toMatchObject({
      group: 'csp-endpoint',
      endpoints: [{ url: 'http://localhost:3000/api/security/csp-report' }],
    })
  })

  it('uses a fresh nonce per request', async () => {
    const [first, second] = await Promise.all([getResponse(), getResponse()])
    const nonceOf = (res: Response) =>
      directiveValue(res.headers.get('Content-Security-Policy-Report-Only'), 'script-src')?.match(
        /'nonce-([a-f0-9]+)'/
      )?.[1]

    expect(nonceOf(first)).toBeTruthy()
    expect(nonceOf(first)).not.toBe(nonceOf(second))
  })

  it('resolves the reporting endpoint against the request origin, not a hardcoded host', async () => {
    const response = await getResponse('https://preview-branch.vercel.app/games')

    expect(response.headers.get('Content-Security-Policy-Report-Only')).toContain(
      'report-uri https://preview-branch.vercel.app/api/security/csp-report'
    )
  })
})
