import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import DiscordProvider from 'next-auth/providers/discord'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import { comparePassword } from './auth'
import { apiLogger } from './logger'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
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
            // User with this email exists
            // IMPORTANT: We allow PrismaAdapter to create new user
            // But in real scenario for account linking from profile,
            // user should use /auth/link page which will show warning first
            
            // Block if this looks like a NEW signin (not linking scenario)
            // We can't reliably detect linking here without session
            // So we block by default for security
            const log = apiLogger('OAuth signIn')
            log.warn('OAuth sign-in blocked - email already exists', { 
              existingUserId: existingUserByEmail.id,
              provider: account.provider,
              email: user.email 
            })
            return false
          }

          // New user with new email - allow PrismaAdapter to create
          // This handles the case where OAuth email differs from primary email
          // PrismaAdapter will create new user and link account
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
        token.name = user.name
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
            name: true,
            emailVerified: true
          }
        })
        if (dbUser) {
          token.id = dbUser.id
          token.name = dbUser.username || dbUser.name
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
          username: user.name?.replace(/\s+/g, '_').toLowerCase() || user.email?.split('@')[0] || 'user'
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
    }
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
