import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/linked-accounts')

export async function GET(req: NextRequest) {
  try {
    await limiter(req)

    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        accounts: {
          select: {
            provider: true,
            providerAccountId: true,
            id: true
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Map accounts by provider
    const linkedAccounts = {
      google: user.accounts.find(a => a.provider === 'google'),
      github: user.accounts.find(a => a.provider === 'github'),
      discord: user.accounts.find(a => a.provider === 'discord')
    }

    return NextResponse.json({ linkedAccounts })

  } catch (error) {
    log.error('Error fetching linked accounts', error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch linked accounts' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await limiter(req)

    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { provider } = await req.json()

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        passwordHash: true,
        accounts: {
          select: { provider: true, id: true }
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent unlinking if it's the only auth method
    if (!user.passwordHash && user.accounts.length === 1) {
      return NextResponse.json(
        { error: 'Cannot unlink the only authentication method. Set a password first.' },
        { status: 400 }
      )
    }

    const account = user.accounts.find(a => a.provider === provider)

    if (!account) {
      return NextResponse.json(
        { error: 'Account not linked' },
        { status: 404 }
      )
    }

    await prisma.account.delete({
      where: { id: account.id }
    })

    log.info('Account unlinked', {
      userId: user.id,
      provider
    })

    return NextResponse.json({
      success: true,
      message: 'Account unlinked successfully'
    })

  } catch (error) {
    log.error('Error unlinking account', error as Error)
    return NextResponse.json(
      { error: 'Failed to unlink account' },
      { status: 500 }
    )
  }
}
