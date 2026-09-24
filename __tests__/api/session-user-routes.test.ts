/**
 * #1137: an API route that reads the session with getServerSession directly
 * skips the suspension check, which is how 29 routes kept serving suspended
 * accounts for up to 30 minutes. Every one now goes through lib/session-user;
 * this keeps a new route from quietly going back to the bare call. Asserted
 * against the source, since the point is which function a route calls.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      return routeFiles(full)
    }
    return entry === 'route.ts' ? [full] : []
  })
}

describe('API routes read the session through lib/session-user', () => {
  it('has no route calling getServerSession directly', () => {
    const offenders = routeFiles(path.join(root, 'app', 'api'))
      .filter((file) => readFileSync(file, 'utf8').includes('getServerSession('))
      .map((file) => path.relative(root, file))

    expect(offenders).toEqual([])
  })
})
