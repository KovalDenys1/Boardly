import type { Adapter, AdapterUser, AdapterAccount } from 'next-auth/adapters'

type AdapterPrismaClient = Pick<
  typeof import('./db').prisma,
  'users' | 'accounts'
>

/**
 * Custom Prisma Adapter for NextAuth
 * 
 * CRITICAL: NextAuth expects singular model names (User, Account, Session)
 * but our schema uses plural names (Users, Accounts, Sessions).
 * 
 * This adapter maps between NextAuth's expectations and our actual schema.
 */
export function CustomPrismaAdapter(prisma: AdapterPrismaClient): Adapter {
  return {
    async createUser(user: AdapterUser) {
      const username = user.name || (user.email ? user.email.split('@')[0] : null)
      const created = await prisma.users.create({
        data: {
          email: user.email,
          emailVerified: user.emailVerified ?? null,
          image: null,
          username: username ?? null,
        },
      })
      return {
        id: created.id,
        name: created.username ?? null,
        email: created.email!,
        emailVerified: created.emailVerified,
        image: created.image,
      }
    },

    async getUser(id: string) {
      const user = await prisma.users.findUnique({ where: { id } })
      if (!user) return null
      return {
        id: user.id,
        name: user.username,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        avatarUrl: user.avatarUrl,
      }
    },

    async getUserByEmail(email: string) {
      const user = await prisma.users.findUnique({ where: { email } })
      if (!user) return null
      return {
        id: user.id,
        name: user.username,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        avatarUrl: user.avatarUrl,
      }
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const account = await prisma.accounts.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      })
      if (!account) return null
      const { user } = account
      return {
        id: user.id,
        name: user.username,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        avatarUrl: user.avatarUrl,
      }
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
      const data: Partial<{ username: string | null; email: string | null; emailVerified: Date | null; image: string | null }> = {}
      if (user.name !== undefined) data.username = user.name
      if (user.email !== undefined) data.email = user.email
      if (user.emailVerified !== undefined) data.emailVerified = user.emailVerified
      // Never let NextAuth overwrite image with an OAuth provider photo — image is managed by our avatar system

      const updated = await prisma.users.update({
        where: { id: user.id },
        data,
      })
      return {
        id: updated.id,
        name: updated.username,
        email: updated.email!,
        emailVerified: updated.emailVerified,
        image: updated.image,
      }
    },

    async deleteUser(userId: string) {
      await prisma.users.delete({ where: { id: userId } })
    },

    async linkAccount(account: AdapterAccount) {
      await prisma.accounts.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: account.session_state,
        },
      })
    },

    async unlinkAccount(params: { providerAccountId: string; provider: string }) {
      await prisma.accounts.delete({
        where: { provider_providerAccountId: { provider: params.provider, providerAccountId: params.providerAccountId } },
      })
    },
  }
}
