import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/user/customize')

const VALID_ACCENT_COLORS = new Set([
  '#FF6B5B', '#4FA3E8', '#48BB78', '#F6AD55',
  '#9B8CFF', '#F687B3', '#FC8181', '#68D391',
])

const VALID_GAME_TYPES = new Set([
  'yahtzee', 'tic_tac_toe', 'rock_paper_scissors', 'memory',
  'guess_the_spy', 'connect_four', 'alias', 'liars_party',
])

export async function GET(request: NextRequest) {
  const rl = await limiter(request)
  if (rl) return rl

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: { bio: true, accentColor: true, featuredGame: true, premiumUntil: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const isPremium = !!user.premiumUntil && user.premiumUntil > new Date()

  return NextResponse.json({
    bio: user.bio ?? '',
    accentColor: user.accentColor ?? null,
    featuredGame: user.featuredGame ?? null,
    isPremium,
  })
}

export async function PATCH(request: NextRequest) {
  const rl = await limiter(request)
  if (rl) return rl

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    bio?: unknown
    accentColor?: unknown
    featuredGame?: unknown
  }

  const dbUser = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: { premiumUntil: true },
  })
  const isPremium = !!dbUser?.premiumUntil && dbUser.premiumUntil > new Date()

  const updateData: { bio?: string | null; accentColor?: string | null; featuredGame?: string | null } = {}

  if (body.bio !== undefined) {
    if (typeof body.bio !== 'string') {
      return NextResponse.json({ error: 'bio must be a string' }, { status: 400 })
    }
    const trimmed = body.bio.trim().slice(0, 160)
    updateData.bio = trimmed || null
  }

  if (body.accentColor !== undefined) {
    if (!isPremium) {
      return NextResponse.json({ error: 'Premium required to set accent color' }, { status: 403 })
    }
    if (body.accentColor !== null && (typeof body.accentColor !== 'string' || !VALID_ACCENT_COLORS.has(body.accentColor))) {
      return NextResponse.json({ error: 'Invalid accent color' }, { status: 400 })
    }
    updateData.accentColor = (body.accentColor as string | null) ?? null
  }

  if (body.featuredGame !== undefined) {
    if (!isPremium) {
      return NextResponse.json({ error: 'Premium required to set featured game' }, { status: 403 })
    }
    if (body.featuredGame !== null && (typeof body.featuredGame !== 'string' || !VALID_GAME_TYPES.has(body.featuredGame))) {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }
    updateData.featuredGame = (body.featuredGame as string | null) ?? null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  await prisma.users.update({
    where: { id: session.user.id },
    data: updateData,
  })

  log.info('Profile customization updated', { userId: session.user.id, fields: Object.keys(updateData) })

  return NextResponse.json({ success: true, ...updateData })
}
