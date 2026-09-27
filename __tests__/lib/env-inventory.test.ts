import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * #1149 - every environment variable the running code can read must be named in
 * .env.example, so the file that documents "what to set" cannot silently drift
 * from "what is read". This is a coverage check in one direction only: it fails
 * when code reads a name .env.example lacks, not when .env.example documents a
 * name (an integration-managed one, say) that no code in this repo reads.
 *
 * scripts/audit-docs.ts's D4 check does the mirror-image job for names quoted in
 * Markdown docs; this test is the code-vs-.env.example half the ticket asked for,
 * kept separate because D4 walks Markdown, not source.
 */

const repoRoot = path.join(__dirname, '..', '..')

/** Every process.env.NAME / process.env['NAME'] the sources read, plus the
 * schema keys lib/env.ts validates (envSchema.parse(process.env) reads every key
 * without ever writing the literal `process.env.KEY`, so a regex over the
 * schema's own field names is the only way to see them). */
function collectEnvNamesFromCode(): Set<string> {
  const names = new Set<string>()
  const roots = ['app', 'lib', 'components', 'hooks', 'scripts', 'prisma', 'e2e', 'proxy.ts']
  const extensions = new Set(['.ts', '.tsx', '.mjs', '.js'])
  const skipDirectories = new Set(['node_modules', '.next', 'generated'])

  function scanFile(absolute: string) {
    const source = readFileSync(absolute, 'utf8')
    // A name never ends in `_`: that shape only shows up as a prose wildcard, e.g.
    // a comment reading "process.env.NEXT_PUBLIC_*" - real code always names the
    // rest of the identifier.
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*[A-Z0-9])\b/g)) {
      names.add(match[1])
    }
    for (const match of source.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*[A-Z0-9])['"]\]/g)) {
      names.add(match[1])
    }
  }

  function walk(absoluteDir: string) {
    for (const entry of readdirSync(absoluteDir)) {
      if (skipDirectories.has(entry)) {
        continue
      }
      const absolute = path.join(absoluteDir, entry)
      const stat = statSync(absolute)
      if (stat.isDirectory()) {
        walk(absolute)
        continue
      }
      if (!extensions.has(path.extname(entry))) {
        continue
      }
      scanFile(absolute)
    }
  }

  for (const root of roots) {
    const absolute = path.join(repoRoot, root)
    if (!existsSync(absolute)) {
      continue
    }
    if (statSync(absolute).isDirectory()) {
      walk(absolute)
    } else {
      scanFile(absolute)
    }
  }

  // lib/env.ts validates its schema with `envSchema.parse(process.env)`, so zod
  // reads every field name internally without the source ever spelling out
  // `process.env.<NAME>` for it. Mirrors scripts/audit-docs.ts's same carve-out.
  const envLib = path.join(repoRoot, 'lib', 'env.ts')
  if (existsSync(envLib)) {
    for (const match of readFileSync(envLib, 'utf8').matchAll(/^\s{2}([A-Z][A-Z0-9_]*):\s*z\./gm)) {
      names.add(match[1])
    }
  }

  // scripts/check-bundle-budget.ts reads these through a helper that takes the
  // name as a runtime string (`process.env[envName]`), so no static regex over
  // `process.env.X` sees them. Named here once, by hand, with the reason.
  names.add('BUNDLE_BUDGET_ROUTE_TOTAL_KIB')
  names.add('BUNDLE_BUDGET_ROUTE_CHUNK_KIB')
  names.add('BUNDLE_BUDGET_VENDOR_KIB')
  names.add('BUNDLE_BUDGET_COMMON_KIB')

  return names
}

/** Every name declared in .env.example, commented-out examples included. */
function collectEnvNamesFromExample(): Set<string> {
  const names = new Set<string>()
  const examplePath = path.join(repoRoot, '.env.example')
  for (const line of readFileSync(examplePath, 'utf8').split('\n')) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)
    if (match) {
      names.add(match[1])
    }
  }
  return names
}

describe('env inventory (#1149)', () => {
  it('declares every environment variable the code reads in .env.example', () => {
    const codeNames = collectEnvNamesFromCode()
    const declaredNames = collectEnvNamesFromExample()

    const missing = [...codeNames].filter((name) => !declaredNames.has(name)).sort()

    expect(missing).toEqual([])
  })
})
