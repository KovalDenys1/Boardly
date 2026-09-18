import { readFileSync } from 'fs'
import { join } from 'path'
import { AUTH_TIMESTAMP_TABLES, EXPECTED_TABLES } from '@/scripts/expected-database-tables'

/** Prisma creates this one itself, so it has no model. */
const UNMODELLED_TABLES = ['_prisma_migrations']

function prismaModelNames(): string[] {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
  // No model in this schema uses @@map, so the model name is the table name.
  expect(schema).not.toContain('@@map')
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1])
}

describe('db:audit expected table inventory (#974)', () => {
  it('expects exactly the tables the schema creates', () => {
    const expected = [...prismaModelNames(), ...UNMODELLED_TABLES].sort()
    const inventory = EXPECTED_TABLES.map((table) => table.name).sort()

    // The audit hard-errored on Sessions and VerificationTokens, which a JWT
    // NextAuth setup never creates, and silently under-reported six models it
    // had never been told about.
    expect(inventory).toEqual(expected)
  })

  it('names no auth table that the schema does not have', () => {
    const models = new Set(prismaModelNames())
    for (const table of AUTH_TIMESTAMP_TABLES) {
      expect(models.has(table)).toBe(true)
    }
  })

  it('gives every table a domain and a purpose', () => {
    for (const table of EXPECTED_TABLES) {
      expect(table.domain).not.toHaveLength(0)
      expect(table.purpose).not.toHaveLength(0)
    }
  })
})
