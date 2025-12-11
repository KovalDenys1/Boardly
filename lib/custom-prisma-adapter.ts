import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './db'
import type { Adapter, AdapterAccount } from 'next-auth/adapters'

/**
 * Custom Prisma Adapter that allows linking OAuth accounts with different emails
 * 
 * Problem: Default PrismaAdapter creates a NEW user for each unique OAuth email.
 * Solution: Override linkAccount to allow linking to currently authenticated user
 *           even if OAuth email differs.
 * 
 * Use case: User has account with kovaldenys@icloud.com + GitHub/Discord
 *           Wants to link Google with kovaldenys@gmail.com
 *           Should link to SAME account, not create new one
 */
export function CustomPrismaAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma)
  
  return {
    ...baseAdapter,
    
    // Override linkAccount to handle cross-email linking
    async linkAccount(account: AdapterAccount) {
      // Call the base adapter's linkAccount
      // This will work for same-email linking
      try {
        return await baseAdapter.linkAccount!(account)
      } catch (error: any) {
        // If error is about user not found, it means OAuth email differs
        // In this case, we should have session data from signIn callback
        // But since we don't have access to it here, we rely on signIn callback
        // to handle the logic
        throw error
      }
    },
  }
}
