import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { validateAvatarFile, uploadAvatar } from '@/lib/supabase-storage'

const log = apiLogger('/api/user/avatar')
const limiter = rateLimit(rateLimitPresets.api)

const UPLOAD_PACK_ID = 'premium-pack-1'

const DEFAULT_AVATAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const
type DefaultAvatarId = (typeof DEFAULT_AVATAR_IDS)[number]

const EXTRA_AVATAR_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const
type ExtraAvatarId = (typeof EXTRA_AVATAR_IDS)[number]

function isDefaultAvatarId(id: unknown): id is DefaultAvatarId {
  return DEFAULT_AVATAR_IDS.includes(id as DefaultAvatarId)
}

function isExtraAvatarId(id: unknown): id is ExtraAvatarId {
  return EXTRA_AVATAR_IDS.includes(id as ExtraAvatarId)
}

function resolveAvatarUrl(id: DefaultAvatarId | ExtraAvatarId): string {
  if (typeof id === 'number') return `/avatars/defaults/avatar-${id}.svg`
  return `/avatars/premium/avatar-${id}.svg`
}

// POST — select avatar or upload custom photo (upload requires purchase)
export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') ?? ''

  // --- Avatar selection (all free) ---
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { avatarId } = body

    if (!isDefaultAvatarId(avatarId) && !isExtraAvatarId(avatarId)) {
      return NextResponse.json({ error: 'Invalid avatar ID' }, { status: 400 })
    }

    const avatarUrl = resolveAvatarUrl(avatarId)
    await prisma.users.update({ where: { id: session.user.id }, data: { avatarUrl } })
    log.info('Avatar selected', { userId: session.user.id, avatarId })
    return NextResponse.json({ avatarUrl })
  }

  // --- Custom photo upload (requires purchase) ---
  if (contentType.includes('multipart/form-data')) {
    const purchase = await prisma.userPurchases.findUnique({
      where: { userId_packId: { userId: session.user.id, packId: UPLOAD_PACK_ID } },
      select: { id: true },
    })
    if (!purchase) {
      return NextResponse.json({ error: 'Photo upload requires the custom avatar upgrade' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validationError = validateAvatarFile(file)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    try {
      const avatarUrl = await uploadAvatar(session.user.id, file)
      await prisma.users.update({ where: { id: session.user.id }, data: { avatarUrl } })
      log.info('Custom avatar uploaded', { userId: session.user.id })
      return NextResponse.json({ avatarUrl })
    } catch (error) {
      log.error('Avatar upload failed', error as Error)
      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
}

// DELETE — remove avatar (revert to initials)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.users.update({
    where: { id: session.user.id },
    data: { avatarUrl: null },
  })

  log.info('Avatar removed', { userId: session.user.id })
  return NextResponse.json({ success: true })
}
