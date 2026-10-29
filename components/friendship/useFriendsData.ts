'use client'

import { useCallback, useEffect, useState } from 'react'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { buildPublicProfilePath, extractPublicProfileId } from '@/lib/public-profile'
import type { Friend, FriendRequest } from './types'

const REFRESH_MS = 60_000

async function postJson(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`)
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Everything the friends page reads and changes, loaded only for a signed-in account with a verified email. */
export function useFriendsData(enabled: boolean) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [received, setReceived] = useState<FriendRequest[]>([])
  const [sent, setSent] = useState<FriendRequest[]>([])
  const [friendCode, setFriendCode] = useState('')
  const [publicProfileId, setPublicProfileId] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)

  const loadFriends = useCallback(async () => {
    const res = await fetch('/api/friends')
    if (!res.ok) throw new Error(`Friends failed to load (${res.status})`)
    const data = await res.json()
    setFriends(data.friends ?? [])
  }, [])

  const loadRequests = useCallback(async () => {
    const [receivedRes, sentRes] = await Promise.all([
      fetch('/api/friends/request?type=received'),
      fetch('/api/friends/request?type=sent'),
    ])
    if (!receivedRes.ok || !sentRes.ok) {
      throw new Error(`Friend requests failed to load (${receivedRes.status}/${sentRes.status})`)
    }
    const [receivedData, sentData] = await Promise.all([receivedRes.json(), sentRes.json()])
    setReceived(receivedData.requests ?? [])
    setSent(sentData.requests ?? [])
  }, [])

  const loadFriendCode = useCallback(async () => {
    try {
      const res = await fetch('/api/user/friend-code')
      if (!res.ok) throw new Error(`Friend code failed to load (${res.status})`)
      const data = await res.json()
      setFriendCode(data.friendCode ?? '')
      setPublicProfileId(data.publicProfileId ?? '')
    } catch (error) {
      clientLogger.error('Error loading friend code:', error)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadFriends(), loadRequests()])
      setLoadFailed(false)
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      setLoadFailed(true)
    }
  }, [loadFriends, loadRequests])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void Promise.all([refresh(), loadFriendCode()]).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [enabled, refresh, loadFriendCode])

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [enabled, refresh])

  /** A five-digit friend code or a profile link, from the one add field. Resolves true once the request is sent. */
  const sendRequest = useCallback(
    async (input: string): Promise<boolean> => {
      const code = input.replace(/\s/g, '')
      const profileId = /^\d{5}$/.test(code) ? null : extractPublicProfileId(input)
      if (!/^\d{5}$/.test(code) && !profileId) {
        showToast.error('profile.friends.errors.invalidCodeOrLink')
        return false
      }

      setSending(true)
      try {
        if (profileId) {
          await postJson('/api/friends/request', { receiverPublicProfileId: profileId })
        } else {
          await postJson('/api/friends/add-by-code', { friendCode: code })
        }
        showToast.success('profile.friends.requestSent')
        void loadRequests().catch((error) => clientLogger.error('Error reloading requests:', error))
        return true
      } catch (error) {
        clientLogger.error('Error sending friend request:', error)
        showToast.errorFrom(asError(error), 'profile.friends.errors.sendRequestFailed')
        return false
      } finally {
        setSending(false)
      }
    },
    [loadRequests]
  )

  const answerRequest = useCallback(
    async (requestId: string, answer: 'accept' | 'reject') => {
      const request = received.find((item) => item.id === requestId)
      if (!request) return

      setBusyRequestId(requestId)
      setReceived((current) => current.filter((item) => item.id !== requestId))
      try {
        await postJson(`/api/friends/request/${requestId}/${answer}`)
        if (answer === 'accept') {
          showToast.success('profile.friends.requestAccepted')
          await loadFriends().catch((error) => clientLogger.error('Error reloading friends:', error))
        } else {
          showToast.success('profile.friends.requestRejected')
        }
      } catch (error) {
        clientLogger.error(`Error answering friend request (${answer}):`, error)
        setReceived((current) => (current.some((item) => item.id === requestId) ? current : [request, ...current]))
        showToast.errorFrom(
          asError(error),
          answer === 'accept' ? 'profile.friends.errors.acceptFailed' : 'profile.friends.errors.rejectFailed'
        )
      } finally {
        setBusyRequestId(null)
      }
    },
    [received, loadFriends]
  )

  const removeFriend = useCallback(async (friendshipId: string) => {
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.error === 'string' ? data.error : `Remove failed (${res.status})`)
      }
      setFriends((current) => current.filter((friend) => friend.friendshipId !== friendshipId))
      showToast.success('profile.friends.friendRemoved')
    } catch (error) {
      clientLogger.error('Error removing friend:', error)
      showToast.errorFrom(asError(error), 'profile.friends.errors.removeFailed')
    }
  }, [])

  const copyFriendCode = useCallback(async () => {
    if (!friendCode) return
    try {
      await navigator.clipboard.writeText(friendCode)
      showToast.success('profile.friends.friendCodeCopied')
    } catch (error) {
      clientLogger.error('Error copying friend code:', error)
      showToast.error('profile.friends.errors.copyCodeFailed')
    }
  }, [friendCode])

  const copyProfileLink = useCallback(async () => {
    if (!publicProfileId) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${buildPublicProfilePath(publicProfileId)}`)
      showToast.success('profile.friends.profileLinkCopied')
    } catch (error) {
      clientLogger.error('Error copying profile link:', error)
      showToast.error('profile.friends.errors.copyLinkFailed')
    }
  }, [publicProfileId])

  /** The system share sheet where there is one, the clipboard otherwise. */
  const shareProfileLink = useCallback(
    async (text: string) => {
      if (!publicProfileId) return
      const url = `${window.location.origin}${buildPublicProfilePath(publicProfileId)}`
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ text, url })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
          clientLogger.warn('Share sheet failed, copying instead:', error)
        }
      }
      await copyProfileLink()
    },
    [publicProfileId, copyProfileLink]
  )

  return {
    friends,
    received,
    sent,
    friendCode,
    publicProfileId,
    loading,
    loadFailed,
    sending,
    busyRequestId,
    refresh,
    sendRequest,
    acceptRequest: (requestId: string) => answerRequest(requestId, 'accept'),
    rejectRequest: (requestId: string) => answerRequest(requestId, 'reject'),
    removeFriend,
    copyFriendCode,
    copyProfileLink,
    shareProfileLink,
  }
}
