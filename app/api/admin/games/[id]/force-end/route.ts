import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, NotFoundError } from '@/lib/error-handler'
import { requireAdminApiUser, writeAdminAuditLog } from '@/lib/admin-auth'

async function postAdminForceEndGameHandler(
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
    },
  })
  if (!existing) {
    throw new NotFoundError('Game')
  }

  const now = new Date()
  const nextStatus =
    existing.status === 'finished' || existing.status === 'cancelled'
      ? existing.status
      : 'cancelled'

  const updated = await prisma.games.update({
    where: { id },
    data: {
      status: nextStatus,
      abandonedAt: nextStatus === 'cancelled' ? now : undefined,
      lastMoveAt: now,
    },
    select: {
      id: true,
      status: true,
      gameType: true,
      lobbyId: true,
      updatedAt: true,
    },
  })

  await writeAdminAuditLog({
    adminId: admin.id,
    action: 'force_end_game',
    targetType: 'game',
    targetId: updated.id,
    details: {
      previousStatus: existing.status,
      nextStatus: updated.status,
      gameType: updated.gameType,
      lobbyId: updated.lobbyId,
    },
  })

  return NextResponse.json({
    message: existing.status === updated.status ? 'Game already ended' : 'Game force-ended',
    game: updated,
  })
}

export const POST = withErrorHandler(postAdminForceEndGameHandler)
