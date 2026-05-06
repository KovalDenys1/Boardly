import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      emailVerified?: Date | null
      role?: 'user' | 'admin'
      suspended?: boolean
      banReason?: string | null
      banExpiresAt?: string | null
    }
  }

  interface User {
    id: string
    email?: string | null
    name?: string | null
    image?: string | null
    emailVerified?: Date | null
    role?: 'user' | 'admin'
    suspended?: boolean
    banReason?: string | null
    banExpiresAt?: string | null
    rememberMe?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    emailVerified?: Date | null
    role?: 'user' | 'admin'
    suspended?: boolean
    banReason?: string | null
    banExpiresAt?: string | null
    rememberMe?: boolean
    authenticatedAt?: number
    lastActiveUpdate?: number // Timestamp of last lastActiveAt update
  }
}
