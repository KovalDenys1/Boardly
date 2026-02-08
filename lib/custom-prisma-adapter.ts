import { PrismaClient } from '@prisma/client'
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from 'next-auth/adapters'

/**
 * Custom Prisma Adapter for NextAuth
 * 
 * CRITICAL: NextAuth expects singular model names (User, Account, Session)
 * but our schema uses plural names (Users, Accounts, Sessions).
 * 
 * This adapter maps between NextAuth's expectations and our actual schema.
 */
export function CustomPrismaAdapter(prisma: PrismaClient): Adapter {
  return {
    async createUser(user: AdapterUser) {
      const username = user.name || (user.email ? user.email.split('@')[0] : null)
      const created = await prisma.users.create({
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
      }
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
      const data: any = {}
      if (user.name !== undefined) data.username = user.name
      if (user.email !== undefined) data.email = user.email
      if (user.emailVerified !== undefined) data.emailVerified = user.emailVerified
      if (user.image !== undefined) data.image = user.image

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

    async createSession(session: {
      sessionToken: string
      userId: string
      expires: Date
    }) {
      const created = await prisma.sessions.create({
        data: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        },
      })
      return {
        sessionToken: created.sessionToken,
        userId: created.userId,
        expires: created.expires,
      }
    },

    async getSessionAndUser(sessionToken: string) {
      const userAndSession = await prisma.sessions.findUnique({
        where: { sessionToken },
        include: { user: true },
      })
      if (!userAndSession) return null
      const { user, ...session } = userAndSession
      return {
        session: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        },
        user: {
          id: user.id,
          name: user.username,
          email: user.email!,
          emailVerified: user.emailVerified,
          image: user.image,
        },
      }
    },

    async updateSession(
      session: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>
    ) {
      const updated = await prisma.sessions.update({
        where: { sessionToken: session.sessionToken },
        data: {
          expires: session.expires,
        },
      })
      return {
        sessionToken: updated.sessionToken,
        userId: updated.userId,
        expires: updated.expires,
      }
    },

    async deleteSession(sessionToken: string) {
      await prisma.sessions.delete({ where: { sessionToken } })
    },

    async createVerificationToken(token: VerificationToken) {
      const created = await prisma.verificationTokens.create({
        data: {
          identifier: token.identifier,
          token: token.token,
          expires: token.expires,
        },
      })
      return {
        identifier: created.identifier,
        token: created.token,
        expires: created.expires,
      }
    },

    async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
      try {
        const verificationToken = await prisma.verificationTokens.delete({
          where: { identifier_token: { identifier, token } },
        })
        return {
          identifier: verificationToken.identifier,
          token: verificationToken.token,
          expires: verificationToken.expires,
        }
      } catch {
        return null
      }
    },
  }
}
