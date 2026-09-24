import { prisma } from './db'
import { apiLogger } from './logger'

const log = apiLogger('POST /api/security/csp-report')

/** Longest field we keep verbatim; anything longer is truncated, never rejected. */
const MAX_FIELD_LENGTH = 500

export interface CspViolationFields {
  documentUri?: string
  violatedDirective?: string
  effectiveDirective?: string
  blockedUri?: string
  disposition?: string
  sample?: string
  statusCode?: number
}

function truncate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > MAX_FIELD_LENGTH ? `${trimmed.slice(0, MAX_FIELD_LENGTH)}…` : trimmed
}

function truncateInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined
}

/**
 * A `report-uri` (legacy) body: `{"csp-report": {"document-uri": ..., "violated-directive": ...}}`,
 * all fields dash-cased. Still the only format Safari sends.
 */
function parseCspReportUriBody(raw: unknown): CspViolationFields | null {
  if (!raw || typeof raw !== 'object') return null
  const report = (raw as Record<string, unknown>)['csp-report']
  if (!report || typeof report !== 'object') return null
  const r = report as Record<string, unknown>
  return {
    documentUri: truncate(r['document-uri']),
    violatedDirective: truncate(r['violated-directive']),
    effectiveDirective: truncate(r['effective-directive']),
    blockedUri: truncate(r['blocked-uri']),
    disposition: truncate(r['disposition']),
    sample: truncate(r['script-sample']),
    statusCode: truncateInt(r['status-code']),
  }
}

/**
 * A `report-to` (Reporting API) body: an array of reports, each
 * `{"type":"csp-violation","url":...,"body":{"documentURL":...,"effectiveDirective":...}}`,
 * body fields camelCased. Only the first `csp-violation` entry is kept — a batch reporting
 * the same navigation's several violations still logs as one record, which is enough to
 * know the endpoint is reachable and what kind of thing is failing.
 */
function parseReportToBody(raw: unknown): CspViolationFields | null {
  if (!Array.isArray(raw)) return null
  const entry = raw.find(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).type === 'csp-violation'
  )
  if (!entry) return null
  const body = entry.body
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  return {
    documentUri: truncate(b['documentURL'] ?? entry.url),
    violatedDirective: truncate(b['effectiveDirective']),
    effectiveDirective: truncate(b['effectiveDirective']),
    blockedUri: truncate(b['blockedURL']),
    disposition: truncate(b['disposition']),
    sample: truncate(b['sample']),
    statusCode: truncateInt(b['statusCode']),
  }
}

/**
 * Accepts whatever shape the browser sent — `report-uri` and `report-to` disagree on both
 * content type and body shape, and this endpoint is wired to both (proxy.ts). Returns null
 * for anything unrecognised rather than throwing: a malformed report is not this endpoint's
 * problem to fail on.
 */
export function parseCspViolationBody(rawBody: unknown): CspViolationFields | null {
  return parseCspReportUriBody(rawBody) ?? parseReportToBody(rawBody)
}

/**
 * Logs a CSP violation and best-effort records it to OperationalEvents so the count is
 * queryable and can back an alert later. Modelled on `recordCronRun` in
 * lib/cron-heartbeat.ts: never throws, because a reporting endpoint must not itself become
 * a reason for a retry storm from the browser.
 */
export async function recordCspViolationReport(fields: CspViolationFields): Promise<void> {
  log.warn('CSP violation reported', {
    documentUri: fields.documentUri,
    violatedDirective: fields.violatedDirective,
    effectiveDirective: fields.effectiveDirective,
    blockedUri: fields.blockedUri,
    disposition: fields.disposition,
    sample: fields.sample,
  })

  try {
    await prisma.operationalEvents.create({
      data: {
        eventName: 'csp_violation_reported',
        metricType: 'alert_signal',
        reason: fields.violatedDirective ?? fields.effectiveDirective ?? null,
        statusCode: fields.statusCode ?? null,
        payload: {
          document_uri: fields.documentUri ?? null,
          blocked_uri: fields.blockedUri ?? null,
          disposition: fields.disposition ?? null,
          sample: fields.sample ?? null,
        },
      },
    })
  } catch (err) {
    log.error('Failed to record a CSP violation report', err instanceof Error ? err : new Error(String(err)))
  }
}
