'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import toast from 'react-hot-toast'
import { useGuest } from '@/contexts/GuestContext'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import {
  LobbyInvitePayload,
  RematchRequestPayload,
  SocketEvents,
} from '@/types/socket-events'

const EVENT_TTL_MS = 60000

export default function SocialLoopListener() {
  const router = useRouter()
  const { status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const seenEventKeysRef = useRef<Map<string, number>>(new Map())

  const canConnect = useMemo(() => {
    if (status === 'authenticated') return true
    if (status === 'loading') return false
    return isGuest && !!guestToken
  }, [guestToken, isGuest, status])

  useEffect(() => {
    if (!canConnect) {
      return
    }

    let activeSocket: ReturnType<typeof io> | null = null
    let isMounted = true
    const isGuestSocket = status !== 'authenticated' && isGuest

    const isDuplicateEvent = (eventKey: string) => {
      const now = Date.now()
      for (const [storedKey, storedAt] of seenEventKeysRef.current.entries()) {
        if (now - storedAt > EVENT_TTL_MS) {
          seenEventKeysRef.current.delete(storedKey)
        }
      }

      if (seenEventKeysRef.current.has(eventKey)) {
        return true
      }

      seenEventKeysRef.current.set(eventKey, now)
      return false
    }

    const connect = async () => {
      const socketAuth = await resolveSocketClientAuth({
        isGuest: isGuestSocket,
        guestToken,
      })

      if (!socketAuth || !isMounted) {
        return
      }

      activeSocket = io(getBrowserSocketUrl(), {
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
        transports: ['polling', 'websocket'],
      })

      activeSocket.on(SocketEvents.LOBBY_INVITE, (payload: LobbyInvitePayload) => {
        const dedupeKey = `invite:${payload.sequenceId || `${payload.lobbyCode}:${payload.invitedById}`}`
        if (isDuplicateEvent(dedupeKey)) {
          return
        }

        const message = `${payload.invitedByName} invited you to ${payload.lobbyName}`
        toast((toastRef) => (
          <div className="flex items-center gap-3">
            <span className="text-sm">{message}</span>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
              onClick={() => {
                toast.dismiss(toastRef.id)
                router.push(`/lobby/join/${payload.lobbyCode}`)
              }}
            >
              Join
            </button>
          </div>
        ))
      })

      activeSocket.on(SocketEvents.REMATCH_REQUEST, (payload: RematchRequestPayload) => {
        const dedupeKey = `rematch:${payload.sequenceId || `${payload.lobbyCode}:${payload.requestedById}`}`
        if (isDuplicateEvent(dedupeKey)) {
          return
        }

        const message = `${payload.requestedByName} asked for a rematch in ${payload.lobbyName}`
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
              Open
            </button>
          </div>
        ))
      })

      activeSocket.on('connect_error', (error) => {
        clientLogger.warn('Social loop listener socket connection failed', {
          message: error.message,
        })
      })
    }

    void connect()

    return () => {
      isMounted = false
      activeSocket?.disconnect()
      activeSocket = null
    }
  }, [canConnect, guestToken, isGuest, router, status])

  return null
}
