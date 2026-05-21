'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import { getSupabaseClient } from '@/lib/supabase-client'
import { clientLogger } from '@/lib/client-logger'
import type { LobbyInvitePayload, RematchRequestPayload } from '@/types/socket-events'

const EVENT_TTL_MS = 60000

export default function SocialLoopListener() {
  const router = useRouter()
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const seenEventKeysRef = useRef<Map<string, number>>(new Map())

  const userId = (session?.user as { id?: string } | undefined)?.id

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return

    const isDuplicateEvent = (eventKey: string) => {
      const now = Date.now()
      for (const [storedKey, storedAt] of seenEventKeysRef.current.entries()) {
        if (now - storedAt > EVENT_TTL_MS) seenEventKeysRef.current.delete(storedKey)
      }
      if (seenEventKeysRef.current.has(eventKey)) return true
      seenEventKeysRef.current.set(eventKey, now)
      return false
    }

    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`user:${userId}`)
      .on(
        'broadcast',
        { event: 'lobby-invite' },
        ({ payload }: { payload: LobbyInvitePayload }) => {
          const dedupeKey = `invite:${payload.sequenceId || `${payload.lobbyCode}:${payload.invitedById}`}`
          if (isDuplicateEvent(dedupeKey)) return

          const message = t('toast.socialInviteMessage', {
            player: payload.invitedByName,
            lobby: payload.lobbyName,
          })
          toast((toastRef) => (
            <div className="flex items-center gap-3">
              <span className="text-sm">{message}</span>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                onClick={() => {
                  toast.dismiss(toastRef.id)
                  router.push(`/lobby/${payload.lobbyCode}`)
                }}
              >
                {t('toast.socialJoinAction')}
              </button>
            </div>
          ))
        }
      )
      .on(
        'broadcast',
        { event: 'rematch-request' },
        ({ payload }: { payload: RematchRequestPayload }) => {
          const dedupeKey = `rematch:${payload.sequenceId || `${payload.lobbyCode}:${payload.requestedById}`}`
          if (isDuplicateEvent(dedupeKey)) return

          const message = t('toast.socialRematchMessage', {
            player: payload.requestedByName,
            lobby: payload.lobbyName,
          })
          toast((toastRef) => (
            <div className="flex items-center gap-3">
              <span className="text-sm">{message}</span>
              <button
                type="button"
                className="rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
                onClick={() => {
                  toast.dismiss(toastRef.id)
                  router.push(`/lobby/${payload.lobbyCode}`)
                }}
              >
                {t('toast.socialOpenAction')}
              </button>
            </div>
          ))
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === 'CHANNEL_ERROR') {
          clientLogger.warn('SocialLoopListener: Supabase channel error', { userId })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, status, router, t])

  return null
}
