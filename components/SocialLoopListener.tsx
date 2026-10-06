'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import { acquireRealtimeChannel, type LobbyChannelHandle } from '@/lib/lobby-channel-registry'
import { fetchUserTopic } from '@/lib/user-realtime-topic-client'
import { readLobbyInviteEvent, readRematchRequestEvent } from '@/lib/social-loop-events'

const EVENT_TTL_MS = 60000

/**
 * Invite and rematch toasts, pushed to the user's own realtime topic.
 *
 * The topic used to be `user:{userId}` and user ids are public, so anyone
 * could read a user's invites or push toasts whose button navigated to a
 * lobby of their choosing (audit S3-05). It is now a name only this user is
 * given (GET /api/realtime/user-topic), and it goes through the channel
 * registry, which drops every frame the server did not sign.
 */
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

    const showInvite = (payload: unknown) => {
      const invite = readLobbyInviteEvent(payload)
      if (!invite) return
      const dedupeKey = `invite:${invite.sequenceId || `${invite.lobbyCode}:${invite.actorId}`}`
      if (isDuplicateEvent(dedupeKey)) return

      const message = t('toast.socialInviteMessage', {
        player: invite.actorName,
        lobby: invite.lobbyName,
      })
      toast((toastRef) => (
        <div className="flex items-center gap-3">
          <span className="text-sm">{message}</span>
          <button
            type="button"
            className="rounded-md bg-bd-lav px-2 py-1 text-xs font-semibold text-(--bd-ink-on-accent) hover:bg-bd-lav-mid"
            onClick={() => {
              toast.dismiss(toastRef.id)
              router.push(`/lobby/${invite.lobbyCode}`)
            }}
          >
            {t('toast.socialJoinAction')}
          </button>
        </div>
      ))
    }

    const showRematch = (payload: unknown) => {
      const rematch = readRematchRequestEvent(payload)
      if (!rematch) return
      const dedupeKey = `rematch:${rematch.sequenceId || `${rematch.lobbyCode}:${rematch.actorId}`}`
      if (isDuplicateEvent(dedupeKey)) return

      const message = t('toast.socialRematchMessage', {
        player: rematch.actorName,
        lobby: rematch.lobbyName,
      })
      toast((toastRef) => (
        <div className="flex items-center gap-3">
          <span className="text-sm">{message}</span>
          <button
            type="button"
            className="rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
            onClick={() => {
              toast.dismiss(toastRef.id)
              router.push(`/lobby/${rematch.lobbyCode}`)
            }}
          >
            {t('toast.socialOpenAction')}
          </button>
        </div>
      ))
    }

    let cancelled = false
    let handle: LobbyChannelHandle | null = null

    void fetchUserTopic(userId).then((topic) => {
      if (cancelled || !topic) return
      handle = acquireRealtimeChannel(topic, {
        events: {
          'lobby-invite': showInvite,
          'rematch-request': showRematch,
        },
      })
    })

    return () => {
      cancelled = true
      handle?.release()
    }
  }, [userId, status, router, t])

  return null
}
