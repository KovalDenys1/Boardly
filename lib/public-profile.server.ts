import { Prisma } from '@/prisma/client'
import { customAlphabet } from 'nanoid'
import { prisma } from './db'
import { PUBLIC_PROFILE_ID_LENGTH } from './public-profile'

const PUBLIC_PROFILE_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const generateProfileId = customAlphabet(PUBLIC_PROFILE_ID_ALPHABET, PUBLIC_PROFILE_ID_LENGTH)

async function createUniquePublicProfileId(): Promise<string> {
  let attempts = 0

  while (attempts < 10) {
    const candidate = generateProfileId()
    const existingUser = await prisma.users.findUnique({
      where: { publicProfileId: candidate },
      select: { id: true },
    })

    if (!existingUser) {
      return candidate
    }

    attempts += 1
  }

  throw new Error('Failed to generate a unique public profile ID')
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

export async function ensureUserHasPublicProfileId(userId: string): Promise<string> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { publicProfileId: true },
  })

  if (user?.publicProfileId) {
    return user.publicProfileId
  }

  const publicProfileId = await createUniquePublicProfileId()

  try {
    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: { publicProfileId },
      select: { publicProfileId: true },
    })

    if (updatedUser.publicProfileId) {
      return updatedUser.publicProfileId
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }
  }

  const refreshedUser = await prisma.users.findUnique({
    where: { id: userId },
    select: { publicProfileId: true },
  })

  if (!refreshedUser?.publicProfileId) {
    throw new Error('Failed to persist a public profile ID')
  }

  return refreshedUser.publicProfileId
}
