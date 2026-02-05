import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { ensureUserHasFriendCode } from '@/lib/friend-code'
import { apiLogger } from '@/lib/logger'

export const runtime = 'nodejs'
// Force dynamic rendering (uses headers)
export const dynamic = 'force-dynamic'

/**
 * GET /api/user/friend-code
 * Get or generate user's friend code
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('/api/user/friend-code')
  
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if email is verified
    if (!session.user.emailVerified) {
      log.warn('Friend code access denied - email not verified', { userId: session.user.id })
      return NextResponse.json(
        { error: 'Email verification required' },
        { status: 403 }
      )
    }

    const friendCode = await ensureUserHasFriendCode(session.user.id)

    log.info('Friend code retrieved', { userId: session.user.id })

    return NextResponse.json({ friendCode })
  } catch (error: any) {
    log.error('Error getting friend code', error)

    return NextResponse.json(
      { error: 'Failed to get friend code' },
      { status: 500 }
    )
  }
}
