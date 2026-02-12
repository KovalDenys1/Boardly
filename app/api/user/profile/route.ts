import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'

const log = apiLogger('PATCH /api/user/profile')

async function patchProfileHandler(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  const { username } = await req.json()

  // Validate username
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required')
  }

  if (username.length < 3 || username.length > 20) {
    throw new ValidationError('Username must be between 3 and 20 characters')
  }

  // Check if username is already taken by another user
  const existingUser = await prisma.users.findFirst({
    where: {
      username,
      NOT: {
        id: session.user.id,
      },
    },
  })

  if (existingUser) {
    throw new ConflictError('Username is already taken')
  }

  // Update user
  const updatedUser = await prisma.users.update({
    where: {
      id: session.user.id,
    },
    data: {
      username,
    },
    select: {
      id: true,
      username: true,
      email: true,
    },
  })

  log.info('Profile updated successfully', {
    userId: session.user.id,
  })

  return NextResponse.json({
    message: 'Profile updated successfully',
    user: updatedUser,
  })
}

export const PATCH = withErrorHandler(patchProfileHandler)
