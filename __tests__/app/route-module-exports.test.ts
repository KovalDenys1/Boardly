import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()

// Next's generated route types (.next/*/types) reject any other value export from a route module.
const ALLOWED = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'generateStaticParams',
])

const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return /^route\.tsx?$/.test(name) ? [full] : []
  })

const valueExports = (source: string): string[] => {
  const names: string[] = []
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.push(match[1])
  }
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim()
      if (!trimmed || trimmed.startsWith('type ')) continue
      names.push(trimmed.split(/\s+as\s+/).pop()!.trim())
    }
  }
  return names
}

describe('route modules', () => {
  const files = routeFiles(path.join(root, 'app'))

  it('finds the route files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('export only handlers and route segment config', () => {
    const offenders = files.flatMap((file) =>
      valueExports(readFileSync(file, 'utf8'))
        .filter((name) => !ALLOWED.has(name))
        .map((name) => `${path.relative(root, file)}: ${name}`),
    )
    expect(offenders).toEqual([])
  })
})
