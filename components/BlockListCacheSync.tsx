'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { syncAccountBlockCache } from '@/lib/client/blocked-players-cache'

/**
 * Keeps the device's copy of a signed-in account's block list (#1466) to that account alone, on
 * every page: sign-out from the header or the drawer, and account deletion, happen where no chat
 * is mounted to do it.
 */
export function BlockListCacheSync() {
  const { data: session, status } = useSession()
  const accountId = status === 'authenticated' ? session?.user?.id ?? null : null

  useEffect(() => {
    if (status === 'loading') return
    syncAccountBlockCache(accountId)
  }, [status, accountId])

  return null
}

export default BlockListCacheSync
