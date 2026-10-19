import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const API_ROOT = join(process.cwd(), 'app', 'api')

// Telephone Doodle declares no hidden state in lib/broadcast-sanitize.ts.
const NO_HIDDEN_STATE = new Set(['app/api/game/[gameId]/telephone-doodle-action/route.ts'])

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routeFiles(path)
    return name === 'route.ts' ? [path] : []
  })
}

describe('every route that broadcasts game state sanitizes it (#1502, #1505)', () => {
  const broadcasting = routeFiles(API_ROOT)
    .map((path) => ({ file: relative(process.cwd(), path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => source.includes("'game-update'"))

  it('finds the routes it guards', () => {
    expect(broadcasting.map(({ file }) => file)).toContain('app/api/game/[gameId]/state/route.ts')
  })

  it.each(broadcasting.filter(({ file }) => !NO_HIDDEN_STATE.has(file)).map(({ file, source }) => [file, source]))(
    '%s runs a sanitizer before it broadcasts',
    (_file, source) => {
      expect(source).toMatch(/sanitize\w*StateForBroadcast/)
    }
  )
})
