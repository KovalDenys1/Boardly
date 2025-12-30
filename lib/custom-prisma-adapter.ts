import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './db'
import type { Adapter, AdapterAccount, AdapterUser } from 'next-auth/adapters'

/**
 * Custom Prisma Adapter that maps NextAuth fields to Prisma schema
 * 
 * Purpose: 
 * 1. Maps NextAuth's `name` field to our Prisma `username` field
 * 2. Handles OAuth user creation with proper field mapping
 * 3. Allows linking OAuth accounts with different emails
 * 
 * Example use case: User has credentials account and wants to link OAuth provider
 *                   Adapter ensures proper field mapping and account linking
 */
export function CustomPrismaAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma)
  
  return {
    ...baseAdapter,
    // Map NextAuth's `name` to our Prisma `username`
    async createUser(user: AdapterUser) {
      const username = user.name || (user.email ? user.email.split('@')[0] : null)
      const created = await prisma.user.create({
        data: {
          email: user.email,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
          username: username ?? null,
        },
      })
      return {
        id: created.id,
        name: created.username ?? null,
        email: created.email ?? null,
        emailVerified: created.emailVerified ?? null,
        image: created.image ?? null,
      }
    },
    async updateUser(user) {
      const username = user.name || (user.email ? user.email.split('@')[0] : null)
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.email ?? undefined,
          emailVerified: user.emailVerified ?? undefined,
          image: user.image ?? undefined,
          username: username ?? undefined,
        },
      })
      return {
        id: updated.id,
        name: updated.username ?? null,
        email: updated.email ?? "",
        emailVerified: updated.emailVerified ?? null,
        image: updated.image ?? null,
      } as AdapterUser
    },
    
    // Override linkAccount to handle cross-email linking
    async linkAccount(account: AdapterAccount) {
      // Call the base adapter's linkAccount
      // This will work for same-email linking
      try {
        return await baseAdapter.linkAccount!(account)
      } catch (error) {
        // Type guard to check if error has message property
        const errorMessage = error instanceof Error ? error.message : String(error)
        // If error is about user not found, it means OAuth email differs
        // In this case, we should have session data from signIn callback
        // But since we don't have access to it here, we rely on signIn callback
        // to handle the logic
        throw error
      }
    },
  }
}
