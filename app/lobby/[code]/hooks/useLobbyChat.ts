'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useGuest } from '@/contexts/GuestContext'
import { useBlockedPlayers } from '@/hooks/useBlockedPlayers'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { acceptTerms as postAcceptTerms, isTermsRequired } from '@/lib/client/terms-consent'
import { playCue } from '@/lib/sound-engine'
import type { ChatMessagePayload } from '@/types/game'

/**
 * Shared lobby chat state (#736 phase 1) — extracted from LobbyPageClient so
 * the dedicated game pages (TTT, C4) can use the same Redis-backed,
 * server-authorized chat pipeline instead of hand-rolling client-side
 * broadcasts (which bypassed persistence/authz and sent id-less payloads).
 *
 * Split in two because of call-order: `useLobbyChat` produces the
 * `onChatMessage` handler that `useRealtimeConnection` needs, while
 * `useLobbyChatHistory` needs the `isConnected` flag that
 * `useRealtimeConnection` returns. Call them around it:
 *
 *   const chat = useLobbyChat({ code, isChatVisible })
 *   const { isConnected, isReconnecting } = useRealtimeConnection({
 *     onChatMessage: chat.onChatMessage, ...
 *   })
 *   useLobbyChatHistory({ code, isConnected, isReconnecting, mergeHistoryMessages: chat.mergeHistoryMessages })
 */

interface UseLobbyChatOptions {
  code: string
  /** Whether the chat UI is currently on screen — suppresses unread counting. */
  isChatVisible: boolean
}

/** What the chat history says about the viewer; only a seated player gets it. */
export interface ChatHistoryViewer {
  termsAccepted?: unknown
}

/**
 * sendChatMessage adds the sender's own message locally under a `temp-` id so it
 * appears instantly. Drop those entries once the server's copy of the same text
 * arrives, whichever path it arrives by.
 */
function withoutConfirmedOptimistic(
  current: ChatMessagePayload[],
  confirmed: ChatMessagePayload[]
): ChatMessagePayload[] {
  return current.filter((m) => {
    if (typeof m.id !== 'string' || !m.id.startsWith('temp-')) return true
    const age = Date.now() - parseInt(m.id.slice(5), 10)
    if (age >= 5000) return true
    return !confirmed.some((c) => c.userId === m.userId && c.message === m.message)
  })
}

export function useLobbyChat({ code, isChatVisible }: UseLobbyChatOptions) {
  const { data: session } = useSession()
  const { isGuest, guestId, guestName } = useGuest()

  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  // null until the history says, or a send is refused: the composer shows meanwhile.
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null)

  // Read via refs so the realtime handlers stay referentially stable and
  // never force useRealtimeConnection to re-subscribe.
  const isChatVisibleRef = useRef(isChatVisible)
  isChatVisibleRef.current = isChatVisible
  const currentUserIdRef = useRef<string | null | undefined>(undefined)
  currentUserIdRef.current = isGuest ? guestId : session?.user?.id
  const codeRef = useRef(code)
  codeRef.current = code
  const chatMessagesRef = useRef<ChatMessagePayload[]>([])
  chatMessagesRef.current = chatMessages
  // Chat hides a blocked player's messages, so they neither count as unread nor make a sound.
  const { blockedIds } = useBlockedPlayers()
  const blockedIdsRef = useRef(blockedIds)
  blockedIdsRef.current = blockedIds

  const onChatMessage = useCallback((message: ChatMessagePayload) => {
    // The lobby's realtime topic is not private and its code is four digits, so
    // an outsider can subscribe to any lobby by enumerating codes. Chat is
    // therefore announced without its text (#801) and the body is fetched from
    // /api/lobby/[code]/chat, which checks membership. A payload that still
    // carries text is handled below for the duration of a rollout.
    if (typeof message?.message !== 'string') {
      void fetchWithGuest(`/api/lobby/${codeRef.current}/chat`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!Array.isArray(data?.messages)) return
          const known = new Set(chatMessagesRef.current.map((m) => m.id))
          const fresh = (data.messages as ChatMessagePayload[]).filter((m) => !known.has(m.id))
          if (fresh.length === 0) return

          setChatMessages((prev) => [...withoutConfirmedOptimistic(prev, fresh), ...fresh])

          const audible = fresh.filter(
            (m) => m.userId !== currentUserIdRef.current && !blockedIdsRef.current.has(m.userId)
          )
          if (audible.length === 0) return
          if (!isChatVisibleRef.current) setUnreadCount((prev) => prev + 1)
          playCue('chat.incoming')
        })
        .catch(() => {
          // Non-critical: history reloads on the next reconnect anyway.
        })
      return
    }

    setChatMessages(prev => [...withoutConfirmedOptimistic(prev, [message]), message])
    if (message.userId === currentUserIdRef.current || blockedIdsRef.current.has(message.userId)) return
    if (!isChatVisibleRef.current) {
      setUnreadCount(prev => prev + 1)
    }
    playCue('chat.incoming')
  }, [])

  const currentUserName = isGuest
    ? guestName
    : (session?.user as { username?: string } | undefined)?.username || session?.user?.name || 'You'
  const currentUserNameRef = useRef(currentUserName)
  currentUserNameRef.current = currentUserName

  /** Resolves to the message when the server asked for the terms first, so the composer can put it back; otherwise null. */
  const sendChatMessage = useCallback((message: string): Promise<string | null> => {
    const currentUserId = currentUserIdRef.current
    const tempId = `temp-${Date.now()}`
    if (currentUserId) {
      setChatMessages(prev => [...prev, {
        id: tempId,
        userId: currentUserId,
        username: currentUserNameRef.current ?? '',
        message,
        timestamp: Date.now(),
      }])
    }
    return Promise.resolve(fetchWithGuest(`/api/lobby/${code}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }))
      .then(async (res) => {
        if (!res || res.ok) return null
        // The server refused it, so nobody else will ever see it: take the
        // optimistic copy back rather than leave the sender believing it went.
        setChatMessages(prev => prev.filter(m => m.id !== tempId))
        if (!(await isTermsRequired(res))) return null
        setTermsAccepted(false)
        return message
      })
      .catch(() => null)
  }, [code])

  const acceptTerms = useCallback(async (): Promise<boolean> => {
    const accepted = await postAcceptTerms()
    if (accepted) setTermsAccepted(true)
    return accepted
  }, [])

  const mergeHistoryMessages = useCallback((history: ChatMessagePayload[], viewer?: ChatHistoryViewer | null) => {
    const accepted = viewer?.termsAccepted
    if (typeof accepted === 'boolean') {
      // A history read that left before the player accepted must not ask them again.
      setTermsAccepted(prev => (prev === true ? true : accepted))
    }
    setChatMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      const fresh = history.filter(m => !existingIds.has(m.id))
      return fresh.length > 0 ? [...fresh, ...prev] : prev
    })
  }, [])

  const resetUnread = useCallback(() => setUnreadCount(0), [])

  return {
    chatMessages,
    sendChatMessage,
    unreadCount,
    resetUnread,
    /** From the history's `viewer`, or false after a send was refused for the terms; null while unknown. */
    termsAccepted,
    acceptTerms,
    /**
     * Always false. The indicator listened for a `player-typing` broadcast that
     * nothing has ever sent, and a client-sent one would now be dropped as
     * unsigned (GHSA-g868-9224-wr3p). `Chat` keeps the prop for the day a
     * server route sends it.
     */
    someoneTyping: false,
    onChatMessage,
    mergeHistoryMessages,
    /** Escape hatch for local-only system messages (bot joined, game started). */
    setChatMessages,
  }
}

interface UseLobbyChatHistoryOptions {
  code: string
  isConnected: boolean
  isReconnecting: boolean
  mergeHistoryMessages: (history: ChatMessagePayload[], viewer?: ChatHistoryViewer | null) => void
}

/** Loads persisted chat history once per connect (re-fetches on reconnect). */
export function useLobbyChatHistory({ code, isConnected, isReconnecting, mergeHistoryMessages }: UseLobbyChatHistoryOptions) {
  const { status } = useSession()
  const { isGuest, guestId, guestToken, guestName } = useGuest()
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!isConnected) return
    if (status === 'loading') return
    if (isGuest && !guestToken) return
    if (loadedRef.current && !isReconnecting) return
    loadedRef.current = true

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (isGuest && guestId && guestToken) {
      headers['X-Guest-Id'] = guestId
      headers['X-Guest-Token'] = guestToken
      if (guestName) headers['X-Guest-Name'] = guestName
    }

    fetch(`/api/lobby/${code}/chat`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const messages = Array.isArray(data.messages) ? (data.messages as ChatMessagePayload[]) : []
        mergeHistoryMessages(messages, data.viewer)
      })
      .catch(() => {
        // non-critical; ignore
      })
  }, [isConnected, isReconnecting, status, isGuest, guestToken, guestId, guestName, code, mergeHistoryMessages])
}
