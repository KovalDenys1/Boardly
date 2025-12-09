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
    async signIn({ user, account, profile }) {
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

          // New OAuth account - check if user exists by email
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
          })

          if (existingUser) {
            // User exists with this email - DO NOT auto-link for security
            // Instead, redirect to error page where user can explicitly choose to merge
            const log = apiLogger('OAuth signIn')
            log.warn('OAuth sign-in attempted with email of existing user', { 
              existingUserId: existingUser.id,
              provider: account.provider,
              email: user.email 
            })
            
            // Return false to prevent sign-in - NextAuth will redirect to error page
            // with query params: error=OAuthAccountNotLinked
            return false
          }

          // New user - PrismaAdapter will create user and account
          // Email will be verified in linkAccount event
          
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
    async linkAccount({ user, account }) {
      // Auto-verify email when OAuth account is linked
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          emailVerified: new Date(),
          username: user.name?.replace(/\s+/g, '_').toLowerCase() || user.email?.split('@')[0] || 'user'
        }
      })
      
      const log = apiLogger('OAuth linkAccount')
      log.info('Account linked and email auto-verified', { 
        userId: user.id, 
        email: user.email,
        provider: account.provider,
        providerAccountId: account.providerAccountId 
      })
    }
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
