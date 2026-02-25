import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { AuthenticationError, AuthorizationError } from '@/lib/error-handler'

export interface AdminSessionUser {
  id: string
  email: string | null
  username: string | null
  role: 'user' | 'admin'
  suspended: boolean
}

export async function requireAdminSession(returnUrl: string = '/admin'): Promise<AdminSessionUser> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`)
  }

  const dbUser = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspended: true,
    },
  })

  if (!dbUser || dbUser.suspended) {
    redirect('/games')
  }

  if (dbUser.role !== 'admin') {
    redirect('/games')
  }

  return dbUser
}

// Route-handler friendly guard (initial middleware equivalent for admin APIs/pages)
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { role: true, suspended: true },
  })

  return Boolean(user && !user.suspended && user.role === 'admin')
}

export async function requireAdminApiUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspended: true,
    },
  })

  if (!user || user.suspended || user.role !== 'admin') {
    throw new AuthorizationError('Admin access required')
  }

  return user
}

export async function writeAdminAuditLog(params: {
  adminId: string
  action: string
  targetType: string
  targetId?: string | null
  details?: unknown
}) {
  const { adminId, action, targetType, targetId, details } = params

  await prisma.adminAuditLogs.create({
    data: {
      adminId,
      action,
      targetType,
      targetId: targetId ?? null,
      details: details === undefined ? undefined : (details as object),
    },
  })
}
