import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { defineConfig, devices } from '@playwright/test'
import { localBaseUrl, resolveDevServerPort } from './e2e/support/app-identity'
import { describeTargetMismatch } from './e2e/support/database-target'

// The workers re-evaluate this file, so loading the environment here is what
// lets the fixtures reach Redis without spawning a process per test.
//
// E2E_DB_ENV_FILE comes first because dotenv keeps the first value it sees:
// naming a file is how a run against production picks up the production
// connection strings instead of whatever .env.local happens to hold (#896).
const envFiles = [process.env.E2E_DB_ENV_FILE, '.env.local', '.env'].filter(
  (file): file is string => Boolean(file)
)
for (const file of envFiles) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) dotenv.config({ path, override: false, quiet: true })
  else if (file === process.env.E2E_DB_ENV_FILE) {
    throw new Error(`e2e: E2E_DB_ENV_FILE points at ${file}, which does not exist.`)
  }
}

// The database has to follow what the suite is pointed at, not the developer's
// file. Refuse rather than run a suite whose cleanup goes somewhere else (#896).
const mismatch = describeTargetMismatch({
  baseUrl: process.env.E2E_BASE_URL,
  databaseUrl: process.env.DATABASE_URL,
})
if (mismatch) throw new Error(mismatch)

// The port the suite's own dev server gets. 3100 by default; E2E_PORT moves it
// when something else has the port, which the control panel does when it is
// run by hand (#900).
const devServerPort = resolveDevServerPort()

/**
 * End-to-end tests, run on demand rather than in CI.
 *
 * These exist for the one class of bug the Jest suite cannot see. Jest mocks
 * Supabase, so it can prove the payload shape and the membership gates but not
 * that a move made in one browser arrives in another — and that is precisely
 * what #801 (chat became "broadcast a signal, fetch the body") and #845 (every
 * lobby topic was renamed to carry a secret) changed. A client subscribing to a
 * different topic than the server broadcasts to raises no error anywhere; it
 * just goes quiet.
 *
 * They talk to the real Supabase project, because Supabase Realtime is the
 * thing under test — a local Postgres would remove the only reason these tests
 * exist. That also means they need .env.local and cannot run in CI, which has
 * no secrets. Lobbies they create are named with a marker and deleted by the
 * global teardown.
 */
export default defineConfig({
  testDir: './e2e',
  // One at a time: the tests share a database, and a lobby code is unique
  // across the whole table.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  // Runs after the webServer plugin, so it probes the server the tests are
  // actually about to drive — started here or adopted — and refuses the run if
  // it is not Boardly (#900).
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',

  timeout: 90_000,
  expect: {
    // Realtime delivery is a round trip through Supabase, so give assertions
    // about "the other browser saw it" room to actually be true.
    timeout: 15_000,
  },

  use: {
    // Port 3100, not 3000: other projects live on 3000. That only narrows the
    // field — `reuseExistingServer` hands the suite whatever answers on the
    // port, and 3100 collided with another project's dev server too (#900).
    // `globalSetup` is what makes reuse safe now: it checks the app's identity.
    baseURL: process.env.E2E_BASE_URL ?? localBaseUrl(devServerPort),
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Pointed at a deployment (E2E_BASE_URL), there is nothing to start — the
  // suite then verifies the released app rather than the working copy.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    // `next dev` rather than a production build: a build takes minutes, and
    // dev mode also skips the origin-based CSRF check for localhost, which the
    // API-driven setup in e2e/support/lobby.ts relies on.
    command: `npm run dev -- -p ${devServerPort}`,
    url: localBaseUrl(devServerPort),
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
