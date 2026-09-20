/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { proxy } from '@/proxy'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('@/lib/csrf', () => ({
  getSecurityHeaders: jest.fn(() => ({
    'X-Frame-Options': 'DENY',
  })),
}))

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>

// The directive as a list of sources, so a host has to be present as its own token. A
// substring check would pass on a host that merely ends with the one we mean.
function sourcesFor(csp: string | null | undefined, directive: string): string[] {
  const part = (csp ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry === directive || entry.startsWith(`${directive} `))
  if (!part) return []
  return part.split(/\s+/).slice(1)
}

async function cspForRequest(): Promise<string> {
  const request = new NextRequest('http://localhost:3000/games', { method: 'GET' })
  const response = await proxy(request)
  return response.headers.get('Content-Security-Policy') ?? ''
}

describe('proxy CSP policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as any)
  })

  it('uses production-safe script-src policy compatible with Next.js runtime bootstrap', async () => {
    const request = new NextRequest('http://localhost:3000/games', {
      method: 'GET',
    })

    const response = await proxy(request)
    const csp = response.headers.get('Content-Security-Policy')
    const scriptSrcDirective = csp
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src'))

    expect(csp).toBeTruthy()
    expect(csp).toContain('script-src')
    expect(csp).toContain("'unsafe-inline'")
    expect(scriptSrcDirective).toBeTruthy()
    expect(scriptSrcDirective).toContain("'self'")
    expect(scriptSrcDirective).not.toContain("'strict-dynamic'")
    expect(scriptSrcDirective).not.toMatch(/'nonce-[^']+'/)
    expect(scriptSrcDirective).not.toContain("'unsafe-eval'")
    // The AdSense loader and the consent message must be allowed to run (#876).
    expect(scriptSrcDirective).toContain('https://pagead2.googlesyndication.com')
    expect(scriptSrcDirective).toContain('https://fundingchoicesmessages.google.com')
    const frameSrcDirective = csp?.split(';').map((part) => part.trim()).find((part) => part.startsWith('frame-src'))
    expect(frameSrcDirective).toContain('https://googleads.g.doubleclick.net')
  })

  // #1045. Each host here is one the shipped AdSense code reaches for, in the directive
  // that governs how it reaches for it. Dropping any one of them fails a test rather than
  // showing up months later as ads that never fill.
  describe('AdSense hosts', () => {
    it('allows the hosts the ad stack connects to', async () => {
      const connectSrc = sourcesFor(await cspForRequest(), 'connect-src')

      expect(connectSrc).toEqual(
        expect.arrayContaining([
          // The ad request and the consent message.
          'https://pagead2.googlesyndication.com',
          'https://fundingchoicesmessages.google.com',
          // show_ads_impl_fy2021.js fetches <ep1>/getconfig/sodar, and sodar2.js beacons
          // to <ep1>/pagead/sodar and <ep1>/pagead/gen_204.
          'https://ep1.adtrafficquality.google',
        ])
      )
    })

    it('allows the scripts the ad stack loads', async () => {
      const scriptSrc = sourcesFor(await cspForRequest(), 'script-src')

      expect(scriptSrc).toEqual(
        expect.arrayContaining([
          'https://pagead2.googlesyndication.com',
          'https://fundingchoicesmessages.google.com',
          'https://tpc.googlesyndication.com',
          'https://googleads.g.doubleclick.net',
          // sodar2.js comes from <ep2> whenever AdSense routes it away from tpc.
          'https://ep2.adtrafficquality.google',
        ])
      )
    })

    it('allows the frames the ad stack opens', async () => {
      const frameSrc = sourcesFor(await cspForRequest(), 'frame-src')

      expect(frameSrc).toEqual(
        expect.arrayContaining([
          'https://googleads.g.doubleclick.net',
          'https://tpc.googlesyndication.com',
          'https://fundingchoicesmessages.google.com',
          // goog_ee_frame, from pagead2/pagead/s/eeframe.html.
          'https://pagead2.googlesyndication.com',
          // The sodar runner, <ep2>/sodar/sodar2/<version>/runner.html.
          'https://ep2.adtrafficquality.google',
        ])
      )
    })

    it('names the ad-traffic-quality endpoints exactly, never by wildcard', async () => {
      const csp = await cspForRequest()
      const adTrafficQualitySources = csp
        .split(/[;\s]+/)
        .filter((source) => source.includes('adtrafficquality.google'))

      expect(adTrafficQualitySources.length).toBeGreaterThan(0)
      for (const source of adTrafficQualitySources) {
        expect(source).not.toContain('*')
      }
    })
  })
})
