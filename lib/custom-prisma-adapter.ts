import type { Adapter, AdapterUser, AdapterAccount } from 'next-auth/adapters'
import { pickOAuthUsername } from './oauth-username'
import { insensitiveEquals, sameName } from './username-match'

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
function isUsernameConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } }
  if (code !== 'P2002') return false
  const target = meta?.target
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : []
  // Prisma can omit the target; a retry with a fresh name is harmless either way.
  return fields.length === 0 || fields.some((field) => String(field).toLowerCase().includes('username'))
}

export function CustomPrismaAdapter(prisma: AdapterPrismaClient): Adapter {
  return {
    async createUser(user: AdapterUser) {
      // The provider's display name, cut to the username rule and made unique; never
      // the email's local part, which would publish part of the address (#1142). This
      // is the name the account keeps: events.linkAccount no longer overwrites it.
      const isTaken = async (candidate: string) => {
        const holders = await prisma.users.findMany({
          where: { username: insensitiveEquals(candidate) },
          select: { username: true },
        })
        return holders.some((row) => sameName(row.username, candidate))
      }
      // No attribution here any more. This runs on the OAuth callback request, which
      // carries nothing of ours — the header died with the page that redirected to the
      // provider, and the cookie that used to bridge the gap needed consent it never had.
      // POST /api/auth/attribution fills the column in once the browser lands back (#1067).
      const create = async () =>
        prisma.users.create({
          data: {
            email: user.email,
            emailVerified: user.emailVerified ?? null,
            image: null,
            username: await pickOAuthUsername(user.name, isTaken),
            // The preferences row from the start, so the account gets the column
            // defaults, friends-only with online status off, instead of the
            // no-row fallback kept for older accounts (#1131).
            accountPreferences: { create: {} },
          },
        })
      let created: Awaited<ReturnType<typeof create>>
      try {
        created = await create()
      } catch (error) {
        // Two sign-ups picking the same free name at once: the loser picks again.
        if (!isUsernameConflict(error)) throw error
        created = await create()
      }
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
