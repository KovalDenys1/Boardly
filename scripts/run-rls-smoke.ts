#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prisma } from '../lib/db'

async function main() {
  const sqlPath = resolve(process.cwd(), 'scripts/rls-smoke.psql')
  const sql = readFileSync(sqlPath, 'utf8')

  await prisma.$executeRawUnsafe(sql)
  console.log('RLS smoke checks passed.')
}

main()
  .catch((error) => {
    console.error('RLS smoke checks failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
