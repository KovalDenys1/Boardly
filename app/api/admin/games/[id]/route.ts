import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, NotFoundError } from '@/lib/error-handler'
import { requireAdminApiUser, writeAdminAuditLog } from '@/lib/admin-auth'

async function deleteAdminGameHandler(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminApiUser()
  const { id } = params

  const existing = await prisma.games.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      gameType: true,
      lobbyId: true,
      _count: {
        select: {
          players: true,
        },
      },
    },
  })
  if (!existing) {
    throw new NotFoundError('Game')
  }

  await prisma.games.delete({ where: { id } })

  await writeAdminAuditLog({
    adminId: admin.id,
    action: 'delete_game',
    targetType: 'game',
    targetId: id,
    details: {
      previousStatus: existing.status,
      gameType: existing.gameType,
      lobbyId: existing.lobbyId,
      playersCount: existing._count.players,
    },
  })

  return NextResponse.json({
    message: 'Game deleted',
    deletedGameId: id,
  })
}

export const DELETE = withErrorHandler(deleteAdminGameHandler)
