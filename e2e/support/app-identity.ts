/**
 * Prove that whatever answers on the base URL is Boardly, before a single test
 * runs against it (#900).
 *
 * `webServer.reuseExistingServer` is true, which is what makes an edit-and-rerun
 * loop bearable: the dev server survives between runs. The cost is that
 * Playwright reuses *anything* that answers on the port and says nothing about
 * it. On 2026-09-10 that was another project's `next dev` — a different
 * application, on Boardly's port, with its own `/api/lobby`. Fourteen specs
 * failed inside `createGuestLobby` and not one of them named the cause.
 *
 * Moving to a higher port only buys time; 3100 is shared with the control
 * panel when that is run by hand, so the next collision is already scheduled.
 * The defect is the unverified reuse, so the fix is to identify the app.
 *
 * `/manifest.json` is the probe because it is a static file in `public/`: every
 * Boardly deployment has served it since long before this guard, so the check
 * also works against production and preview without waiting for a release, and
 * `next dev` answers it without compiling a route. A foreign Next app either
 * has no manifest (404) or has one that names itself.
 *
 * The match is on `short_name` and it is exact, not a substring: the control
 * panel shares this database, this schema and half this vocabulary, and a
 * manifest it grows later would be called something like "Boardly Admin".
 * `__tests__/scripts/e2e-app-identity.test.ts` reads `public/manifest.json` and
 * asserts this guard still accepts it, so a rename cannot pass unnoticed.
 */

/** Where `next dev` listens when the suite starts the server itself. */
export const DEFAULT_DEV_SERVER_PORT = 3100

/** How long the probe waits before calling the base URL unreachable. */
export const IDENTITY_PROBE_TIMEOUT_MS = 10_000

/** The route that names the application. Static, so it needs no compilation. */
export const IDENTITY_PATH = '/manifest.json'

/** `short_name` in `public/manifest.json`, which is what the probe must find. */
export const EXPECTED_SHORT_NAME = 'Boardly'

/** Only the variables this module reads, so a test can pass a bare object. */
export type SuiteEnv = {
  E2E_PORT?: string
  E2E_BASE_URL?: string
  [key: string]: string | undefined
}

export type AppIdentity =
  | { kind: 'boardly'; name: string }
  | { kind: 'foreign'; detail: string }
  | { kind: 'unreachable'; detail: string }

/**
 * The port the suite's own dev server uses. `E2E_PORT` is the way out of a
 * collision that is nobody's fault — the control panel also defaults to 3100.
 */
export function resolveDevServerPort(env: SuiteEnv = process.env): number {
  const raw = env.E2E_PORT?.trim()
  if (!raw) return DEFAULT_DEV_SERVER_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`e2e: E2E_PORT must be a port number between 1 and 65535, got "${raw}".`)
  }
  return port
}

export function localBaseUrl(port: number): string {
  return `http://localhost:${port}`
}

/** What the suite will actually drive: an explicit target, or its own server. */
export function resolveBaseUrl(env: SuiteEnv = process.env): string {
  return env.E2E_BASE_URL?.trim() || localBaseUrl(resolveDevServerPort(env))
}

/** Reads the application name out of a manifest response. */
export function readManifestIdentity(status: number, body: string): AppIdentity {
  if (status !== 200) {
    return { kind: 'foreign', detail: `GET ${IDENTITY_PATH} answered ${status}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { kind: 'foreign', detail: `GET ${IDENTITY_PATH} did not answer with JSON` }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { kind: 'foreign', detail: `GET ${IDENTITY_PATH} did not answer with a manifest` }
  }

  const manifest = parsed as { name?: unknown; short_name?: unknown }
  const shortName = typeof manifest.short_name === 'string' ? manifest.short_name.trim() : ''
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  if (!shortName && !name) {
    return { kind: 'foreign', detail: `${IDENTITY_PATH} names no application` }
  }
  if (shortName.toLowerCase() !== EXPECTED_SHORT_NAME.toLowerCase()) {
    return { kind: 'foreign', detail: `${IDENTITY_PATH} belongs to "${shortName || name}"` }
  }
  return { kind: 'boardly', name: name || shortName }
}

/**
 * Returns the reason the suite must not run against this server, or null when
 * the server is Boardly.
 */
export function describeIdentityProblem(options: {
  baseUrl: string
  identity: AppIdentity
  /** True when the suite starts the server itself, i.e. no E2E_BASE_URL. */
  startsOwnServer: boolean
  port?: number
}): string | null {
  const { baseUrl, identity, startsOwnServer, port } = options
  if (identity.kind === 'boardly') return null

  const wayOut = startsOwnServer
    ? `  Either free the port — lsof -ti:${port ?? DEFAULT_DEV_SERVER_PORT} | xargs kill -9 — or give\n` +
      `  the suite one of its own: E2E_PORT=3111 npm run test:e2e\n`
    : `  Check E2E_BASE_URL. It should name a Boardly deployment.\n`

  if (identity.kind === 'unreachable') {
    return (
      `e2e: refusing to run — nothing answered at ${baseUrl} (#900).\n` +
      `  ${identity.detail}\n` +
      `\n` +
      wayOut
    )
  }

  return (
    `e2e: refusing to run — ${baseUrl} is not Boardly (#900).\n` +
    `  ${identity.detail}\n` +
    `\n` +
    `  reuseExistingServer hands the suite whatever is already listening, so a\n` +
    `  foreign dev server on this port would be tested instead of Boardly, and\n` +
    `  every failure would point at the wrong thing.\n` +
    `\n` +
    wayOut
  )
}

/** Asks the base URL what application it is. Never throws. */
export async function probeAppIdentity(
  baseUrl: string,
  fetcher: typeof fetch = fetch
): Promise<AppIdentity> {
  let url: string
  try {
    url = new URL(IDENTITY_PATH, baseUrl).toString()
  } catch {
    return { kind: 'unreachable', detail: `${baseUrl} is not a URL` }
  }

  try {
    const response = await fetcher(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(IDENTITY_PROBE_TIMEOUT_MS),
    })
    return readManifestIdentity(response.status, await response.text())
  } catch (error) {
    return { kind: 'unreachable', detail: error instanceof Error ? error.message : String(error) }
  }
}
