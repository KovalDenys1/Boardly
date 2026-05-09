import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/request-auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getRequestAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const purchases = await prisma.userPurchases.findMany({
    where: { userId: user.id },
    select: { packId: true },
  })

  return NextResponse.json({ purchases: purchases.map((p) => p.packId) })
}
