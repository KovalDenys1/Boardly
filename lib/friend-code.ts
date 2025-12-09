import { prisma } from './db'

/**
 * Generate a unique 5-digit friend code for a user
 * Format: 12345 (easy to read and share)
 */
export async function generateUniqueFriendCode(): Promise<string> {
  let attempts = 0
  const maxAttempts = 10

  while (attempts < maxAttempts) {
    // Generate 5-digit code (10000 - 99999)
    const code = Math.floor(10000 + Math.random() * 90000).toString()

    // Check if code already exists
    const existing = await prisma.user.findUnique({
      where: { friendCode: code },
      select: { id: true }
    })

    if (!existing) {
      return code
    }

    attempts++
  }

  // Fallback: use timestamp-based code if all random attempts fail
  return Date.now().toString().slice(-5)
}

/**
 * Assign friend code to user if they don't have one
 */
export async function ensureUserHasFriendCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { friendCode: true }
  })

  if (user?.friendCode) {
    return user.friendCode
  }

  const friendCode = await generateUniqueFriendCode()
  
  await prisma.user.update({
    where: { id: userId },
    data: { friendCode }
  })

  return friendCode
}

/**
 * Find user by friend code
 */
export async function findUserByFriendCode(friendCode: string) {
  return prisma.user.findUnique({
    where: { friendCode },
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      friendCode: true
    }
  })
}
