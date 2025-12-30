import { NextAuthOptions } from 'next-auth'
// Use custom adapter to map `name` -> `username` and handle linking
import { CustomPrismaAdapter } from './custom-prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import DiscordProvider from 'next-auth/providers/discord'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import { comparePassword } from './auth'
import { apiLogger } from './logger'

export const authOptions: NextAuthOptions = {
  adapter: CustomPrismaAdapter(),
  providers: [
    // Include providers only when configured to avoid build-time errors
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? [
          DiscordProvider({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.passwordHash) {
          return null
        }

        const isValid = await comparePassword(credentials.password, user.passwordHash)

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          image: user.image,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error-oauth',
  },
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      // Handle OAuth sign-ins (Google, GitHub, Discord)
      if (account?.provider && account.provider !== 'credentials') {
        try {
          // Manual linking handled in events.linkAccount callback
          // Here we just validate and allow/deny the sign-in
          
          // Check if there's already an account with this provider + providerAccountId
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId
              }
            },
            include: { user: true }
          })

          if (existingAccount) {
            // Account already exists - allow sign in
            // Auto-verify email if not already verified
            if (!existingAccount.user.emailVerified) {
              await prisma.user.update({
                where: { id: existingAccount.userId },
                data: { emailVerified: new Date() }
              })
              
              const log = apiLogger('OAuth signIn')
              log.info('Auto-verified existing OAuth user', { userId: existingAccount.userId })
            }
            return true
          }

          // New OAuth account - check if user with this email already exists
          const existingUserByEmail = await prisma.user.findUnique({
            where: { email: user.email! },
          })

          if (existingUserByEmail) {
            // A user with this email already exists — allow sign-in and let
            // PrismaAdapter link the OAuth account to the existing user.
            // Also ensure emailVerified is set for convenience.
            await prisma.user.update({
              where: { id: existingUserByEmail.id },
              data: { emailVerified: existingUserByEmail.emailVerified ?? new Date() }
            })

            const log = apiLogger('OAuth signIn')
            log.info('OAuth sign-in allowed — email exists, will link to existing user', {
              existingUserId: existingUserByEmail.id,
              provider: account.provider,
              email: user.email
            })
            return true
          }

          // New user with new email - allow PrismaAdapter to create
          // IMPORTANT: If OAuth email differs from primary, this creates SEPARATE user
          // To link to existing user, use /auth/link page workflow
          const log = apiLogger('OAuth signIn')
          log.info('New OAuth user will be created', {
            provider: account.provider,
            email: user.email
          })
          
        } catch (error) {
          console.error('Error in signIn callback:', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user, trigger }) {
      // On sign in, add user data to token
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = (user as any).username || user.email?.split('@')[0] || 'user'
        token.picture = user.image
        token.emailVerified = user.emailVerified
      }
      
      // Ensure we have user data from database
      if (!token.id && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: {
            id: true,
            username: true,
            emailVerified: true
          }
        })
        if (dbUser) {
          token.id = dbUser.id
          token.name = dbUser.username
          token.emailVerified = dbUser.emailVerified
        }
      }
      
      // Refresh emailVerified status on update trigger
      if (trigger === 'update' && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { emailVerified: true }
        })
        if (dbUser) {
          token.emailVerified = dbUser.emailVerified
        }
      }
      
      return token
    },
    async session({ session, token }) {
      // Add user data to session
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.picture as string
        session.user.emailVerified = token.emailVerified as Date | null
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-verify email for new OAuth users
      // Note: This event fires BEFORE accounts are linked by PrismaAdapter
      // We'll verify in signIn callback instead when we can check account type
      const log = apiLogger('OAuth createUser')
      log.info('New user created', { userId: user.id, email: user.email })
    },
    async linkAccount({ user, account, profile }) {
      // Auto-verify email when OAuth account is linked
      // This event fires when PrismaAdapter successfully links an OAuth account
      // Important: This works even if OAuth email differs from user's primary email
      
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          emailVerified: new Date(),
          // Only set username if user doesn't have one yet
          username: (user as any).username || user.email?.split('@')[0] || 'user'
        }
      })
      
      const log = apiLogger('OAuth linkAccount')
      log.info('OAuth account linked successfully', { 
        userId: user.id, 
        userEmail: user.email,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        // @ts-ignore - profile.email may exist depending on provider
        oauthEmail: profile?.email || 'unknown'
      })
    },
    async signIn({ user, account, profile, isNewUser }) {
      // Phase 2: Handle manual OAuth linking with different email
      // This event fires AFTER successful OAuth authentication
      // Check if there's a pending link request in cookies
      
      if (!account || account.provider === 'credentials') {
        return // Skip for credentials login
      }

      try {
        // Import cookies dynamically to avoid Edge runtime issues
        const { cookies } = await import('next/headers')
        const cookieStore = cookies()
        const pendingLinkCookie = cookieStore.get('pendingOAuthLink')

        if (!pendingLinkCookie?.value) {
          return // No pending link, normal OAuth flow
        }

        const pendingLink = JSON.parse(pendingLinkCookie.value)
        const { userId, provider, timestamp } = pendingLink

        // Validate cookie is for this OAuth provider
        if (provider !== account.provider) {
          const log = apiLogger('OAuth Manual Link')
          log.warn('Provider mismatch in pending link', {
            expected: provider,
            actual: account.provider
          })
          cookieStore.delete('pendingOAuthLink')
          return
        }

        // Check cookie expiry (10 minutes)
        const expiryTime = 10 * 60 * 1000
        if (Date.now() - timestamp > expiryTime) {
          const log = apiLogger('OAuth Manual Link')
          log.warn('Pending link cookie expired')
          cookieStore.delete('pendingOAuthLink')
          return
        }

        // Get the target user
        const targetUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            accounts: {
              where: { provider: account.provider },
              select: { id: true }
            }
          }
        })

        if (!targetUser) {
          const log = apiLogger('OAuth Manual Link')
          log.error('Target user not found for pending link', undefined, { userId })
          cookieStore.delete('pendingOAuthLink')
          return
        }

        // Check if already linked
        if (targetUser.accounts.length > 0) {
          const log = apiLogger('OAuth Manual Link')
          log.warn('Provider already linked to target user', {
            userId: targetUser.id,
            provider: account.provider
          })
          cookieStore.delete('pendingOAuthLink')
          return
        }

        // SUCCESS: Manually create Account record linking OAuth to existing user
        // This bypasses NextAuth's "create new user" behavior when emails differ
        await prisma.account.create({
          data: {
            userId: targetUser.id, // Link to EXISTING user
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            refresh_token: account.refresh_token,
            access_token: account.access_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token,
            session_state: account.session_state as string | null | undefined,
          }
        })

        // Delete the temporary user that NextAuth created (if new user)
        if (isNewUser && user.id !== targetUser.id) {
          await prisma.user.delete({
            where: { id: user.id }
          }).catch(() => {
            // Ignore if user doesn't exist or has constraints
          })
        }

        // Clean up cookie
        cookieStore.delete('pendingOAuthLink')

        const log = apiLogger('OAuth Manual Link')
        log.info('Successfully linked OAuth account with different email', {
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          // @ts-ignore - profile.email may exist
          oauthEmail: profile?.email || 'unknown'
        })

      } catch (error) {
        const log = apiLogger('OAuth Manual Link')
        log.error('Error in manual OAuth linking', error instanceof Error ? error : new Error(String(error)))
      }
    }
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
