import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, NotFoundError, ValidationError } from '@/lib/error-handler'
import { requireAdminApiUser, writeAdminAuditLog } from '@/lib/admin-auth'

async function postAdminSuspendUserHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminApiUser()
  const { id } = params
  const body = (await req.json().catch(() => ({}))) as { suspended?: unknown }

  if (typeof body.suspended !== 'boolean') {
    throw new ValidationError('Body must include boolean "suspended"')
  }

  if (id === admin.id && body.suspended) {
    throw new ValidationError('Admin cannot suspend their own account')
  }

  const existing = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      suspended: true,
      role: true,
      email: true,
      username: true,
    },
  })
  if (!existing) {
    throw new NotFoundError('User')
  }

  const updated = await prisma.users.update({
    where: { id },
    data: { suspended: body.suspended },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspended: true,
      updatedAt: true,
    },
  })

  await writeAdminAuditLog({
    adminId: admin.id,
    action: body.suspended ? 'suspend_user' : 'unsuspend_user',
    targetType: 'user',
    targetId: updated.id,
    details: {
      previousSuspended: existing.suspended,
      nextSuspended: updated.suspended,
      targetRole: updated.role,
    },
  })

  return NextResponse.json({
    message: updated.suspended ? 'User suspended' : 'User unsuspended',
    user: updated,
  })
}

export const POST = withErrorHandler(postAdminSuspendUserHandler)
