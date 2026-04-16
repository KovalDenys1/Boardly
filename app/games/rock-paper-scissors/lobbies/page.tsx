'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import LoadingSpinner from '@/components/LoadingSpinner'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'

let socket: Socket | null = null

interface Lobby {
  id: string
  code: string
  name: string
  maxPlayers: number
  gameType: string
  creator: {
    username: string | null
    email: string | null
  }
  games: {
    id: string
    status: string
    _count: {
      players: number
    }
  }[]
}

export default function RockPaperScissorsLobbiesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated' || isGuest
  const canCreateLobby = !isTemporarilyUnavailableGameType('rock_paper_scissors')

  const loadLobbies = useCallback(async () => {
    try {
      const res = await fetchWithGuest('/api/lobby?gameType=rock_paper_scissors')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLobbies(data.lobbies || [])
    } catch (err) {
      clientLogger.error('Failed to load RPS lobbies:', err)
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated' && !isGuest) {
      setLoading(false)
      return
    }
    if (isGuest && !guestToken) return
    if (status !== 'authenticated' && !isGuest) return

    loadLobbies()
    let isMounted = true

    const refreshInterval = setInterval(() => {
      loadLobbies()
    }, 5000)

    const initSocket = async () => {
      if (socket) return
      const url = getBrowserSocketUrl()
      const useGuestAuth = isGuest && status !== 'authenticated'
      const socketAuth = await resolveSocketClientAuth({
        isGuest: useGuestAuth,
        guestToken: useGuestAuth ? guestToken : null,
      })
      if (!socketAuth || !isMounted) return

      socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })
      socket.on('connect', () => {
        socket?.emit('join-lobby-list')
      })
      socket.on('lobby-list-update', () => {
        loadLobbies()
      })
    }
    void initSocket()

    return () => {
      isMounted = false
      clearInterval(refreshInterval)
      if (socket?.connected) {
        socket.emit('leave-lobby-list')
        socket.disconnect()
      }
      socket = null
    }
  }, [status, isGuest, guestToken, loadLobbies])

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    if (joinCode.length === 4) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  const displayName = (lobby: Lobby) => {
    const activeGame = lobby.games.find((g) => g.status === 'waiting' || g.status === 'playing')
    const playerCount = activeGame?._count?.players ?? 0
    return `${playerCount}/${lobby.maxPlayers} players`
  }

  const getStatusBadge = (lobby: Lobby) => {
    const activeGame = lobby.games.find((g) => g.status === 'waiting' || g.status === 'playing')
    if (!activeGame) return null
    if (activeGame.status === 'playing') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> In game
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Open
      </span>
    )
  }

  const creatorName = (lobby: Lobby) =>
    lobby.creator?.username || lobby.creator?.email?.split('@')[0] || 'Unknown'

  if (status === 'loading' || loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="page-shell bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Breadcrumbs */}
        <nav className="mb-5 flex items-center gap-2 text-sm text-white/75 overflow-x-auto">
          <button onClick={() => router.push('/')} className="hover:text-white transition-colors whitespace-nowrap">
            🏠 Home
          </button>
          <span>›</span>
          <button onClick={() => router.push('/games')} className="hover:text-white transition-colors whitespace-nowrap">
            🎮 Games
          </button>
          <span>›</span>
          <span className="font-semibold text-white whitespace-nowrap">✂️ Rock Paper Scissors</span>
        </nav>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white drop-shadow-lg sm:text-4xl">
              🍂 Rock Paper Scissors
            </h1>
            <p className="mt-1 text-white/85 sm:text-base">
              {isAuthenticated
                ? 'Join an open lobby or create your own!'
                : 'Browse lobbies — sign in to create or join.'}
            </p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="w-full rounded-xl bg-white/20 px-5 py-2.5 font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 sm:w-auto"
          >
            ← Back to Games
          </button>
        </div>

        {!isAuthenticated && (
          <div className="mb-5 rounded-xl border border-white/20 bg-white/10 p-4 text-white/90 backdrop-blur-sm">
            <p className="font-semibold">Want to play?</p>
            <p className="mt-1 text-sm">Sign in to host or join a game.</p>
            <div className="mt-3 flex flex-col gap-2 xs:flex-row">
              <button
                onClick={() => router.push('/auth/login?returnUrl=/games/rock-paper-scissors/lobbies')}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/auth/register?returnUrl=/games/rock-paper-scissors/lobbies')}
                className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Action cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Create lobby */}
          <div
            className={`rounded-2xl border-2 border-white/20 p-6 shadow-xl transition-all sm:p-8 ${
              canCreateLobby
                ? 'cursor-pointer bg-gradient-to-br from-emerald-500 to-teal-600 hover:scale-[1.02] hover:shadow-2xl'
                : 'bg-white/10 backdrop-blur-md opacity-80'
            }`}
            onClick={() => {
              if (!canCreateLobby) {
                return
              }
              if (!isAuthenticated) {
                router.push(`/auth/login?returnUrl=${encodeURIComponent('/lobby/create')}`)
                return
              }
              router.push('/lobby/create?gameType=rock_paper_scissors')
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-5xl sm:text-6xl">✨</span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                {canCreateLobby ? 'NEW GAME' : 'UNAVAILABLE'}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              {canCreateLobby ? 'Create New Lobby' : 'Lobby Creation Unavailable'}
            </h2>
            <p className="mt-2 text-white/90 sm:text-base">
              {canCreateLobby
                ? 'Start a Best-of-3 or Best-of-5 match and invite a friend!'
                : 'Joining existing lobbies still works, but creating new Rock Paper Scissors lobbies is temporarily disabled.'}
            </p>
            {canCreateLobby ? (
              <div className="mt-4 flex items-center gap-2 font-bold text-white">
                <span>Create Now</span>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold text-white/80">Check the open lobbies below instead.</p>
            )}
          </div>

          {/* Quick join */}
          <div className="rounded-2xl border-2 border-white/20 bg-white/10 p-6 shadow-lg backdrop-blur-md sm:p-8">
            <h2 className="mb-2 text-xl font-bold text-white sm:text-2xl">🔍 Quick Join</h2>
            <p className="mb-4 text-sm text-white/80">Have a lobby code? Enter it below.</p>
            <div className="flex flex-col gap-2 xs:flex-row">
              <input
                type="text"
                placeholder="Enter 4-digit code"
                className="flex-1 rounded-xl border-2 border-white/30 bg-white/20 px-4 py-3 font-mono text-base text-white placeholder-white/60 backdrop-blur-sm focus:border-transparent focus:ring-2 focus:ring-white"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={joinCode.length !== 4 || !isAuthenticated}
                className="rounded-xl bg-white px-6 py-3 font-bold text-indigo-600 shadow-lg transition hover:scale-105 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        </div>

        {/* Lobby list */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white sm:text-xl">
              Open Lobbies
              {lobbies.length > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-semibold">
                  {lobbies.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => loadLobbies()}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              ↻ Refresh
            </button>
          </div>

          {lobbies.length === 0 ? (
            <div className="rounded-2xl border border-white/20 bg-white/10 py-12 text-center text-white/80 backdrop-blur-sm">
              <p className="text-5xl mb-3">🍂</p>
              <p className="text-lg font-semibold">No open lobbies right now</p>
              <p className="mt-1 text-sm text-white/60">
                {canCreateLobby
                  ? 'Be the first — create a lobby above!'
                  : 'Lobby creation is temporarily unavailable for this game.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {lobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm transition hover:bg-white/20"
                  onClick={() => router.push(`/lobby/${lobby.code}`)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-white">{lobby.name}</p>
                      {getStatusBadge(lobby)}
                    </div>
                    <p className="mt-0.5 text-xs text-white/70">
                      {displayName(lobby)} · hosted by {creatorName(lobby)} · code:{' '}
                      <span className="font-mono font-bold">{lobby.code}</span>
                    </p>
                  </div>
                  <button className="ml-3 shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-600 transition hover:bg-indigo-50">
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
