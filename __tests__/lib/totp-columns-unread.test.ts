/**
 * @jest-environment node
 */
/**
 * #1142 item 4: `Users.totpSecret` and `totpPendingSecret` hold the admin second factor,
 * which only the Control Panel enforces. Nothing in this app may read them, so a data
 * leak through one of its routes can never carry them: no code under app/ or lib/ names
 * either column, and the Prisma client omits both from every query by default.
 *
 * `totpEnabled` is a flag, not a secret, and stays readable: the GDPR export
 * (app/api/user/export) reports whether two-factor sign-in is on.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const SECRET_COLUMNS = /\btotp(?:Secret|PendingSecret)\b/

describe('TOTP secret columns', () => {
  it('are named nowhere in app/ or lib/ except the client omit that hides them', () => {
    const offenders = ['app', 'lib']
      .flatMap((dir) => walk(path.join(root, dir)))
      .filter((file) => path.relative(root, file) !== path.join('lib', 'db.ts'))
      .filter((file) => SECRET_COLUMNS.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file))

    expect(offenders).toEqual([])
  })

  it('are omitted from every query by the Prisma client', () => {
    const db = readFileSync(path.join(root, 'lib', 'db.ts'), 'utf8')
    expect(db).toMatch(/users:\s*\{\s*totpSecret:\s*true,\s*totpPendingSecret:\s*true\s*\}/)
  })
})
