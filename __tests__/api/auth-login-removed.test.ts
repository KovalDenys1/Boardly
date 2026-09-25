import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * #1138: app/api/auth/login/route.ts was a second, session-less password
 * check with no caller anywhere in the app — NextAuth's signIn('credentials')
 * handles the real thing, in app/api/auth/[...nextauth] — but its own
 * rate-limit budget (5/15 min, separate from the real sign-in path's 10/15
 * min) gave an attacker 15 guesses per IP per window against a route that
 * told suspended-vs-invalid apart after a correct password. Deleting the
 * file is what makes Next.js's own file-based router answer 404 for
 * POST /api/auth/login: there is nothing left for it to route to.
 *
 * This pins two things staying true after the deletion: the route file does
 * not come back, and nothing anywhere in the app still names it (the ticket's
 * own grep). It also confirms the security-headers proxy still runs on the
 * path, the same way it would for any other unmatched route, so the 404
 * response is not somehow missing CSP/security headers.
 */
describe('the dead /api/auth/login route (#1138)', () => {
  const projectRoot = process.cwd()

  it('has no route.ts left under app/api/auth/login', () => {
    expect(existsSync(path.join(projectRoot, 'app', 'api', 'auth', 'login', 'route.ts'))).toBe(false)
  })

  it('is referenced nowhere in app, components, lib or hooks', () => {
    const roots = ['app', 'components', 'lib', 'hooks'].filter((dir) =>
      existsSync(path.join(projectRoot, dir))
    )
    const hits: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
        if (readFileSync(full, 'utf8').includes('api/auth/login')) hits.push(path.relative(projectRoot, full))
      }
    }

    for (const root of roots) walk(path.join(projectRoot, root))

    expect(hits).toEqual([])
  })

  it('still falls under the security-headers proxy matcher, like any other API path', () => {
    // Same extraction proxy-matcher.test.ts uses: the matcher is a statically
    // analyzable literal, read out of the source rather than imported.
    const source = readFileSync(path.join(projectRoot, 'proxy.ts'), 'utf8')
    const matcher = source.match(/matcher: \[\n\s*'([^']+)',\n\s*\],/)?.[1]
    expect(matcher).toBeDefined()

    const pattern = new RegExp(`^${(matcher ?? '').replace(/\\\\/g, '\\')}$`)
    expect(pattern.test('/api/auth/login')).toBe(true)
  })
})
