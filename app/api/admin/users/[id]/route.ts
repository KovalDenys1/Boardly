import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, NotFoundError, ValidationError } from '@/lib/error-handler'
import { requireAdminApiUser, writeAdminAuditLog } from '@/lib/admin-auth'

async function deleteAdminUserHandler(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminApiUser()
  const { id } = params

  if (id === admin.id) {
    throw new ValidationError('Admin cannot delete their own account')
  }

  const existing = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspended: true,
      lobbies: { select: { id: true } },
    },
  })
  if (!existing) {
    throw new NotFoundError('User')
  }

  const createdLobbyIds = existing.lobbies.map((lobby) => lobby.id)

  await prisma.$transaction(async (tx) => {
    if (createdLobbyIds.length > 0) {
      await tx.games.deleteMany({
        where: { lobbyId: { in: createdLobbyIds } },
      })
      await tx.lobbies.deleteMany({
        where: { id: { in: createdLobbyIds } },
      })
    }

    await tx.passwordResetTokens.deleteMany({ where: { userId: id } })
    await tx.emailVerificationTokens.deleteMany({ where: { userId: id } })

    await tx.users.delete({ where: { id } })

    await tx.adminAuditLogs.create({
      data: {
        adminId: admin.id,
        action: 'delete_user',
        targetType: 'user',
        targetId: id,
        details: {
          deletedUserEmail: existing.email,
          deletedUsername: existing.username,
          deletedRole: existing.role,
          deletedSuspended: existing.suspended,
          deletedCreatedLobbies: createdLobbyIds.length,
        },
      },
    })
  })

  return NextResponse.json({
    message: 'User deleted',
    deletedUserId: id,
  })
}

export const DELETE = withErrorHandler(deleteAdminUserHandler)
