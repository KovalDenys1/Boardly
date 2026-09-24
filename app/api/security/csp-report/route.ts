import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { parseCspViolationBody, recordCspViolationReport } from '@/lib/csp-report'
import { rateLimit } from '@/lib/rate-limit'

const log = apiLogger('POST /api/security/csp-report')

// A page that trips the report-only policy on every load (see proxy.ts) can send one of
// these per script tag, so the ceiling is generous - the point of #1145 is to see the real
// volume, not to throttle it away. Still capped: this is a public, unauthenticated endpoint.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'Too many CSP reports',
})

// A real violation report is at most a few hundred bytes; a `report-to` batch with several
// violations is bigger but still small. 20 KB is generous headroom, not a real limit.
const MAX_BODY_BYTES = 20_000

function isEmptyResponse(status = 204) {
  return new NextResponse(null, { status })
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const contentLengthHeader = request.headers.get('content-length')
  const declaredLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null
  if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return isEmptyResponse(413)
  }

  let rawText: string
  try {
    rawText = await request.text()
  } catch {
    // A body the runtime itself refused to read (truncated stream, etc). Nothing to record.
    return isEmptyResponse()
  }

  if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
    return isEmptyResponse(413)
  }

  // A malformed or empty body is never an error worth telling the browser about - CSP
  // reporting has no retry semantics that would benefit from a 4xx here, and reporting one
  // would only teach an attacker something got parsed.
  if (!rawText) {
    return isEmptyResponse()
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawText)
  } catch {
    return isEmptyResponse()
  }

  const fields = parseCspViolationBody(parsedJson)
  if (!fields) {
    log.warn('Received a CSP report in an unrecognised shape', {
      contentType: request.headers.get('content-type'),
    })
    return isEmptyResponse()
  }

  await recordCspViolationReport(fields)

  return isEmptyResponse()
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
