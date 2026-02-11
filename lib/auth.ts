import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

function getAuthSecret(): string {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is required for auth token signing')
  }

  return process.env.NEXTAUTH_SECRET
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function createToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, getAuthSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, getAuthSecret()) as { userId: string; email: string }
  } catch {
    return null
  }
}
