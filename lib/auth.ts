import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function createToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; email: string }
  } catch {
    return null
  }
}
