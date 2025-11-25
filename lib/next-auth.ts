import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import { comparePassword } from './auth'
import { apiLogger } from './logger'

export const authOptions: NextAuthOptions = {
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
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle OAuth sign-ins (Google, GitHub)
      if (account?.provider && account.provider !== 'credentials') {
        try {
          // Check if user already exists by email
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
          })

          if (!existingUser) {
            // Create new user from OAuth profile
            const newUser = await prisma.user.create({
              data: {
                email: user.email!,
                name: user.name,
                image: user.image,
                username: user.email!.split('@')[0],
                emailVerified: new Date(),
              },
            })
            
            // Update user object with database ID
            user.id = newUser.id
            
            const log = apiLogger('OAuth signIn')
            log.info('Created new OAuth user', { userId: newUser.id, email: newUser.email })
          } else {
            // Use existing user ID
            user.id = existingUser.id
            const log = apiLogger('OAuth signIn')
            log.info('OAuth user already exists', { userId: existingUser.id, email: existingUser.email })
          }
        } catch (error) {
          console.error('Error in signIn callback:', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user }) {
      // On sign in, add user id to token
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }
      
      // Ensure we have user ID from database
      if (!token.id && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.name = dbUser.username || dbUser.name
        }
      }
      
      return token
    },
    async session({ session, token }) {
      // Add user id to session
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.picture as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
