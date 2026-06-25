'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAnnouncePresence } from '@/hooks/useFriendPresence'

/**
 * Renders nothing — side-effect-only component that announces this user's
 * presence on the global online-users Supabase Presence channel for as long
 * as it's mounted (i.e. for as long as the user has any Boardly tab open).
 * Respects the "Show online status" account preference: when disabled, it
 * never announces (but doesn't block other consumers from reading presence).
 */
export function PresenceTracker() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [showOnlineStatus, setShowOnlineStatus] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch('/api/user/account-preferences', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.preferences?.showOnlineStatus === 'boolean') {
          setShowOnlineStatus(data.preferences.showOnlineStatus)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  useAnnouncePresence(userId, showOnlineStatus)

  return null
}
