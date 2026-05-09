import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { validateAvatarFile, uploadAvatar } from '@/lib/supabase-storage'

const log = apiLogger('/api/user/avatar')
const limiter = rateLimit(rateLimitPresets.api)

const DEFAULT_AVATAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const
type DefaultAvatarId = (typeof DEFAULT_AVATAR_IDS)[number]

const PREMIUM_AVATAR_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const
type PremiumAvatarId = (typeof PREMIUM_AVATAR_IDS)[number]

const PREMIUM_PACK_ID = 'premium-pack-1'

function isDefaultAvatarId(id: unknown): id is DefaultAvatarId {
  return DEFAULT_AVATAR_IDS.includes(id as DefaultAvatarId)
}

function isPremiumAvatarId(id: unknown): id is PremiumAvatarId {
  return PREMIUM_AVATAR_IDS.includes(id as PremiumAvatarId)
}

function defaultAvatarUrl(id: DefaultAvatarId): string {
  return `/avatars/defaults/avatar-${id}.svg`
}

function premiumAvatarUrl(id: PremiumAvatarId): string {
  return `/avatars/premium/avatar-${id}.svg`
}

// POST — select default avatar or upload custom
export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') ?? ''

  // --- Default or premium avatar selection ---
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { avatarId } = body

    if (isPremiumAvatarId(avatarId)) {
      const purchase = await prisma.userPurchases.findUnique({
        where: { userId_packId: { userId: session.user.id, packId: PREMIUM_PACK_ID } },
        select: { id: true },
      })
      if (!purchase) {
        return NextResponse.json({ error: 'Premium pack not purchased' }, { status: 403 })
      }
      const avatarUrl = premiumAvatarUrl(avatarId)
      await prisma.users.update({ where: { id: session.user.id }, data: { avatarUrl } })
      log.info('Premium avatar selected', { userId: session.user.id, avatarId })
      return NextResponse.json({ avatarUrl })
    }

    if (!isDefaultAvatarId(avatarId)) {
      return NextResponse.json({ error: 'Invalid avatar ID' }, { status: 400 })
    }

    const avatarUrl = defaultAvatarUrl(avatarId)
    await prisma.users.update({
      where: { id: session.user.id },
      data: { avatarUrl },
    })

    log.info('Default avatar selected', { userId: session.user.id, avatarId })
    return NextResponse.json({ avatarUrl })
  }

  // --- Custom file upload ---
  if (contentType.includes('multipart/form-data')) {
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
      await prisma.users.update({
        where: { id: session.user.id },
        data: { avatarUrl },
      })

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
