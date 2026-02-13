#!/usr/bin/env tsx

import dotenv from 'dotenv'
import { resolve } from 'path'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const prisma = new PrismaClient()

  try {
    const [total, active] = await Promise.all([
      prisma.spyLocations.count(),
      prisma.spyLocations.count({ where: { isActive: true } }),
    ])

    console.log(`Spy locations total: ${total}`)
    console.log(`Spy locations active: ${active}`)

    if (active === 0) {
      console.error(
        'No active Spy locations configured. Run `npm run db:seed:spy-locations` or add rows in Supabase.'
      )
      process.exit(1)
    }

    console.log('Spy locations are configured.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Failed to check Spy locations:', error instanceof Error ? error.message : error)
  process.exit(1)
})
