import 'dotenv/config'
import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'prisma/config'

const envPath = resolve(process.cwd(), '.env')
const envLocalPath = resolve(process.cwd(), '.env.local')

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true, quiet: true })
}

if (!existsSync(envPath) && existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true, quiet: true })
}

const prismaCliUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!prismaCliUrl) {
  throw new Error('DATABASE_URL or DIRECT_URL must be set for Prisma CLI commands')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: prismaCliUrl,
  },
})
