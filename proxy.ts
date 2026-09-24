import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import {
  getSecurityHeaders,
  isSignatureAuthenticatedWebhook,
  isUnauthenticatedReportingEndpoint,
  verifyCsrfToken,
} from '@/lib/csrf'
import {
  authorizeDiscordInternalRequest,
  hasValidDiscordInternalSecret,
} from '@/lib/discord/internal-auth'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
const SECURITY_HEADERS = getSecurityHeaders()
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://boardly.online',
]
const ALLOWED_ORIGINS_FROM_ENV = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  : []
const RAW_ALLOWED_CORS_ORIGINS = ALLOWED_ORIGINS_FROM_ENV.length > 0
  ? ALLOWED_ORIGINS_FROM_ENV
  : DEFAULT_CORS_ORIGINS

function normalizeCorsOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null

  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

const ALLOWED_CORS_ORIGIN_SET = new Set(
  RAW_ALLOWED_CORS_ORIGINS
    .map((origin) => normalizeCorsOrigin(origin))
    .filter((origin): origin is string => origin !== null)
)
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function resolveAllowedCorsOrigin(origin: string | null): string | null {
  const normalizedOrigin = normalizeCorsOrigin(origin)
  if (!normalizedOrigin) return null

  if (ALLOWED_CORS_ORIGIN_SET.has(normalizedOrigin)) {
    return normalizedOrigin
  }

  if (IS_DEVELOPMENT && isLocalDevelopmentOrigin(normalizedOrigin)) {
    return normalizedOrigin
  }

  return null
}

function hasValidInternalSecret(request: NextRequest): boolean {
  const configuredSecret = process.env.BOARDLY_INTERNAL_SECRET
  if (!configuredSecret) return false
  return request.headers.get('X-Internal-Secret') === configuredSecret
}

function hasValidCronAuthorization(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

// The Discord bot's routes. Its secret opens these and nothing else, so a Pi env file
// that leaks cannot reach the crons or the bot-turn trigger.
const DISCORD_INTERNAL_PATH_PREFIX = '/api/internal/discord/'

function isDiscordInternalPath(pathname: string): boolean {
  return pathname.startsWith(DISCORD_INTERNAL_PATH_PREFIX)
}

function isTrustedServerRequest(request: NextRequest): boolean {
  if (hasValidInternalSecret(request) || hasValidCronAuthorization(request)) return true
  return isDiscordInternalPath(request.nextUrl.pathname) && hasValidDiscordInternalSecret(request)
}

function buildCspHeaderValue() {
  const connectSrcCandidates = new Set<string>([
    "'self'",
    'ws://localhost:*',
    'ws://127.0.0.1:*',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://vercel.live',
    'https://*.ingest.sentry.io',
    'https://*.ingest.de.sentry.io',
    // AdSense and the Google consent message (#876) talk back to these.
    'https://pagead2.googlesyndication.com',
    'https://fundingchoicesmessages.google.com',
    'https://csi.gstatic.com',
    // The sodar config fetch – show_ads_impl XHRs <ep1>/getconfig/sodar when AdSense
    // routes it to the ad-traffic-quality host instead of pagead2 (#1045). Only the
    // XHR needs this: sodar2.js sends its /pagead/sodar and /pagead/gen_204 beacons
    // as <img> loads, which img-src already covers, and it contains no fetch, no
    // XMLHttpRequest and no sendBeacon at all. ep1 also needs script-src, below.
    'https://ep1.adtrafficquality.google',
  ])

  const connectSrcValue = Array.from(connectSrcCandidates).join(' ')
  // Next.js 15 app-router output includes inline bootstrap scripts without nonce
  // across statically rendered routes. Keep production CSP compatible with that
  // output to avoid blocking core Next.js chunk/bootstrap execution.
  // The AdSense loader, the ad-serving hosts it pulls in, and the Google
  // consent message (#784 put the tag in the HTML; #876 found that the policy
  // had never let it run).
  //
  // Google publishes no allowlist for AdSense – support.google.com/adsense/answer/16283098
  // says the only supported policy is a nonce with 'strict-dynamic', which the Next.js
  // app-router bootstrap cannot take. So the hosts below come from reading the scripts
  // Google actually ships, not from guesswork (#1045, read 2026-09-20):
  //   - show_ads_impl_fy2021.js frames the pagead2 copy of zrt_lookup.html, and also
  //     pagead2/pagead/s/eeframe.html as goog_ee_frame -> frame-src.
  //   - the same file fetches <ep1>/getconfig/sodar and loads <ep2>/sodar/sodar2.js whenever
  //     the ad-traffic-quality path is on; the tpc.googlesyndication.com mirrors of both were
  //     already allowed, the adtrafficquality ones were not -> connect-src and script-src.
  //   - sodar2.js then frames <ep2>/sodar/sodar2/<v>/runner.html -> frame-src.
  //   - sodar2.js also loads botguard from <ep1>/bg/<hash>.js, and that one is script-src
  //     too, not connect-src or frame-src: it appends a <script> to a srcless iframe, which
  //     inherits this policy. The same config flag that sends sodar2.js and runner.html to
  //     ep2 sends botguard to ep1, so allowing ep2 without ep1 leaves the chain broken one
  //     step further down. Its pagead2 sibling, <pagead2>/bg/<hash>.js, was already allowed,
  //     which is why the ep1 branch was the only one that failed.
  // Exact hosts, no wildcard: ep1 and ep2 are the only endpoints those two files name. If
  // Google moves to an ep3 this breaks the same way again, and the check is the same one –
  // load a page with an ad unit and read the CSP violations in the console.
  const adsScriptHosts =
    'https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com https://tpc.googlesyndication.com https://googleads.g.doubleclick.net https://www.googletagservices.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google'
  const scriptSrcValue = IS_DEVELOPMENT
    ? `'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com ${adsScriptHosts}`
    : `'self' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com ${adsScriptHosts}`

  return `
    default-src 'self';
    script-src ${scriptSrcValue};
    style-src 'self' 'unsafe-inline' https://accounts.google.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data:;
    connect-src ${connectSrcValue};
    worker-src 'self' blob:;
    frame-src 'self' https://accounts.google.com https://vercel.live https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com https://pagead2.googlesyndication.com https://ep2.adtrafficquality.google;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${IS_DEVELOPMENT ? '' : 'upgrade-insecure-requests;'}
  `.replace(/\s{2,}/g, ' ').trim()
}

/** Path of the CSP violation reporting endpoint (`app/api/security/csp-report/route.ts`). */
const CSP_REPORT_PATH = '/api/security/csp-report'
const CSP_REPORT_GROUP = 'csp-endpoint'

/**
 * #1145 (S4-05): production `script-src` still carries `'unsafe-inline'` with no nonce and
 * no reporting, so an HTML-injection bug would execute silently. Enforcing a nonce today
 * would force every page onto per-request dynamic rendering to inject a matching nonce into
 * its script tags, which breaks the rule that the 15 guide pages stay statically prerendered
 * (see "Ads" in this repo's CLAUDE.md) and would need AdSense re-verified under
 * `strict-dynamic` first. So this ships as `Content-Security-Policy-Report-Only` instead: a
 * per-request nonce that is never written into any script tag, so *nothing* on the site
 * carries it. Every inline bootstrap script and every third-party tag (AdSense included)
 * therefore reports a violation without blocking anything - that count is the real, measured
 * cost of the switch the ticket asks a follow-up to decide, not a guess. The enforced
 * `Content-Security-Policy` header above is untouched; this is additive visibility only.
 */
function buildCspReportOnlyHeaderValue(reportUrl: string): string {
  // A fresh nonce per request is correct even though it never appears in the HTML: it is
  // what a real nonce policy would look like, so every inline script - having no nonce at
  // all - is reported exactly as it would be blocked once this becomes enforced.
  const nonce = crypto.randomUUID().replace(/-/g, '')

  return [
    `script-src 'self' https: 'nonce-${nonce}' 'strict-dynamic'`,
    "object-src 'none'",
    "base-uri 'self'",
    `report-to ${CSP_REPORT_GROUP}`,
    `report-uri ${reportUrl}`,
  ].join('; ') + ';'
}

/**
 * The Reporting API's current header (Chrome 96+) and its predecessor, sent together so a
 * browser that only understands one of them still delivers reports. Safari supports neither
 * as of this writing and falls back to the CSP-level `report-uri` directive above instead.
 */
function buildReportingEndpointsHeaderValue(reportUrl: string): string {
  return `${CSP_REPORT_GROUP}="${reportUrl}"`
}

function buildLegacyReportToHeaderValue(reportUrl: string): string {
  return JSON.stringify({
    group: CSP_REPORT_GROUP,
    max_age: 10886400,
    endpoints: [{ url: reportUrl }],
  })
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

  const SUSPENDED_EXEMPT = ['/suspended', '/auth/', '/api/', '/_next/', '/favicon']
  const isSuspendedExempt = SUSPENDED_EXEMPT.some((p) => pathname.startsWith(p))
  if (!isSuspendedExempt) {
    const suspendedToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (suspendedToken?.suspended) {
      return NextResponse.redirect(new URL('/suspended', request.url))
    }
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (request.method === 'OPTIONS' && pathname.startsWith('/api/admin')) {
      // Let CORS preflight pass; auth is enforced on actual request methods.
    } else {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
      const isAdmin = token?.role === 'admin' && !token?.suspended

      if (!isAdmin) {
        if (pathname.startsWith('/api/admin')) {
          const status = token ? 403 : 401
          return NextResponse.json(
            { error: token ? 'Admin access required' : 'Authentication required' },
            { status }
          )
        }

        if (!token) {
          const loginUrl = new URL('/auth/login', request.url)
          loginUrl.searchParams.set('returnUrl', pathname)
          return NextResponse.redirect(loginUrl)
        }

        return NextResponse.redirect(new URL('/games', request.url))
      }
    }
  }

  // Add security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  response.headers.set('Content-Security-Policy', buildCspHeaderValue())

  // #1145: visibility only, nothing enforced. See buildCspReportOnlyHeaderValue for why.
  const cspReportUrl = new URL(CSP_REPORT_PATH, request.nextUrl.origin).toString()
  response.headers.set('Content-Security-Policy-Report-Only', buildCspReportOnlyHeaderValue(cspReportUrl))
  response.headers.set('Reporting-Endpoints', buildReportingEndpointsHeaderValue(cspReportUrl))
  response.headers.set('Report-To', buildLegacyReportToHeaderValue(cspReportUrl))

  // Add CORS headers for API routes.
  // When no Origin header is present (same-origin requests), Safari still performs
  // access-control checks in certain conditions. Fall back to the server's own origin
  // so CORS headers are always present on API responses.
  if (pathname.startsWith('/api')) {
    // Gate the bot's routes here as well as in the handlers: a wrong or missing secret
    // never reaches a function, and the heartbeat POST (no Origin header, so no CSRF
    // token) is let through below only because the same secret marks it trusted.
    if (isDiscordInternalPath(pathname) && request.method !== 'OPTIONS') {
      const authError = authorizeDiscordInternalRequest(request)
      if (authError) return authError
    }

    const origin = request.headers.get('origin')
    const allowedOrigin =
      resolveAllowedCorsOrigin(origin) ??
      (origin === null ? resolveAllowedCorsOrigin(request.nextUrl.origin) : null)

    if (allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Guest-Token')
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      response.headers.set('Vary', 'Origin')
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: response.headers })
    }

    const isUnsafeMethod = !SAFE_METHODS.has(request.method.toUpperCase())
    if (
      isUnsafeMethod &&
      !isSignatureAuthenticatedWebhook(pathname) &&
      !isTrustedServerRequest(request) &&
      !isUnauthenticatedReportingEndpoint(pathname) &&
      !verifyCsrfToken(request)
    ) {
      return NextResponse.json(
        { error: 'Invalid origin. Possible CSRF attack.' },
        { status: 403 }
      )
    }
  }

  return response
}

/**
 * Paths the proxy has no business touching: files served to crawlers and to the
 * browser's own machinery, never to a logged-in person. Running the proxy on
 * them costs a `getToken()` per request and puts a session cookie on a response
 * that should be plain and cacheable.
 *
 * Honest scope: this does not change indexing. Search Console already fetches
 * `sitemap.xml` through the proxy without trouble, and a `Set-Cookie` on a file
 * a crawler reads is ignored for ranking. It is latency and tidiness.
 *
 * The pattern stays one inline literal because Next.js reads `config.matcher`
 * by static analysis at build time - an imported constant or a `join()` here
 * silently produces a middleware that matches nothing.
 * `__tests__/app/proxy-matcher.test.ts` compiles this exact string out of the
 * source and asks it about real paths, because a typo in it fails open or
 * closed with nothing else noticing.
 *
 * Excluded, in order: Next's own static and image routes, the favicon, the
 * public folder, `robots.txt`, `sitemap.xml`, `ads.txt`, `manifest.json`,
 * `sw.js`, `offline.html`, the IndexNow key file (32 hex characters at the site
 * root, fetched by Bing to verify a submission) and `.well-known`.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|public/|robots\\.txt|sitemap\\.xml|ads\\.txt|manifest\\.json|sw\\.js|offline\\.html|[0-9a-f]{32}\\.txt|\\.well-known/).*)',
  ],
}
