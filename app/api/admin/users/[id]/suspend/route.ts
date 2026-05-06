import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, NotFoundError, ValidationError } from '@/lib/error-handler'
import { requireAdminApiUser, writeAdminAuditLog } from '@/lib/admin-auth'

async function postAdminSuspendUserHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser()
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    suspended?: unknown
    banReason?: unknown
    banExpiresAt?: unknown
  }

  if (typeof body.suspended !== 'boolean') {
    throw new ValidationError('Body must include boolean "suspended"')
  }

  const banReason =
    body.suspended && typeof body.banReason === 'string' && body.banReason.trim()
      ? body.banReason.trim()
      : null

  let banExpiresAt: Date | null = null
  if (body.suspended && typeof body.banExpiresAt === 'string' && body.banExpiresAt) {
    const parsed = new Date(body.banExpiresAt)
    if (isNaN(parsed.getTime())) {
      throw new ValidationError('banExpiresAt must be a valid ISO date string')
    }
    if (parsed <= new Date()) {
      throw new ValidationError('banExpiresAt must be in the future')
    }
    banExpiresAt = parsed
  }

  if (id === admin.id && body.suspended) {
    throw new ValidationError('Admin cannot suspend their own account')
  }

  const existing = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      suspended: true,
      banReason: true,
      banExpiresAt: true,
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
    data: body.suspended
      ? { suspended: true, banReason, banExpiresAt }
      : { suspended: false, banReason: null, banExpiresAt: null },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspended: true,
      banReason: true,
      banExpiresAt: true,
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
      banReason: updated.banReason,
      banExpiresAt: updated.banExpiresAt?.toISOString() ?? null,
      targetRole: updated.role,
    },
  })

  return NextResponse.json({
    message: updated.suspended ? 'User suspended' : 'User unsuspended',
    user: updated,
  })
}

export const POST = withErrorHandler(postAdminSuspendUserHandler)
