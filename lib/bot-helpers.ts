import { prisma } from './db'

/**
 * Check if a user is a bot by userId
 */
export async function isBot(userId: string): Promise<boolean> {
  const bot = await prisma.bots.findUnique({
    where: { userId },
    select: { id: true }
  })
  return !!bot
}

/**
 * Check if multiple users are bots (batch operation)
 * Returns a Map of userId -> isBot
 */
export async function checkMultipleBots(userIds: string[]): Promise<Map<string, boolean>> {
  const bots = await prisma.bots.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true }
  })
  
  const botUserIds = new Set(bots.map(b => b.userId))
  const result = new Map<string, boolean>()
  
  for (const userId of userIds) {
    result.set(userId, botUserIds.has(userId))
  }
  
  return result
}

/**
 * Create a bot user with bot record
 */
export async function createBot(
  username: string,
  botType: string = 'generic',
  difficulty: string = 'medium'
) {
  return await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.users.create({
      data: {
        username,
        isGuest: false,
        email: `${username.toLowerCase().replace(/\s/g, '_')}@bot.boardly.online`,
      }
    })
    
    // Create bot record
    const bot = await tx.bots.create({
      data: {
        userId: user.id,
        botType,
        difficulty,
      }
    })
    
    return { user, bot }
  })
}

/**
 * Get bot info by userId
 */
export async function getBotInfo(userId: string) {
  return await prisma.bots.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          image: true,
        }
      }
    }
  })
}

/**
 * Delete a bot and its user record
 */
export async function deleteBot(userId: string) {
  // Cascade delete will handle bot record
  return await prisma.users.delete({
    where: { id: userId }
  })
}

/**
 * Helper to check if user object has bot relation loaded
 */
export function isBotUser(user: { bot?: unknown }): boolean {
  return user.bot !== null && user.bot !== undefined
}
