'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, type Socket } from 'socket.io-client'
import LoadingSpinner from '@/components/LoadingSpinner'
import TicTacToeGameIcon from '@/components/ui/TicTacToeGameIcon'
import { useGuest } from '@/contexts/GuestContext'
import { clientLogger } from '@/lib/client-logger'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { useTranslation } from '@/lib/i18n-helpers'
import { getLobbyCreateRoute, isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { getBrowserSocketUrl } from '@/lib/socket-url'

type Lobby = {
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

type GameLobbiesPageProps = {
  gameType: string
  iconVariant?: 'tic-tac-toe'
  pagePath: string
  titleEmoji: string
  gameNameKey: TranslationKeys
  lobbiesNamespace: string
}

function GameLobbyIcon({
  titleEmoji,
  usage,
  variant,
}: {
  titleEmoji: string
  usage: 'breadcrumb' | 'title' | 'card' | 'empty'
  variant?: GameLobbiesPageProps['iconVariant']
}) {
  if (variant === 'tic-tac-toe') {
    if (usage === 'breadcrumb') {
      return <span>{titleEmoji}</span>
    }

    if (usage === 'title') {
      return null
    }

    if (usage === 'empty') {
      return null
    }

    const size = {
      card: 82,
    }[usage]

    const className = {
      card: 'shrink-0',
    }[usage]

    return <TicTacToeGameIcon className={className} size={size} />
  }

  if (usage === 'breadcrumb') {
    return <span>{titleEmoji}</span>
  }

  if (usage === 'title') {
    return <span className="ml-3 text-[0.75em]">{titleEmoji}</span>
  }

  if (usage === 'empty') {
    return (
      <span className="mx-auto mb-4 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border-2 border-bd-ink bg-bd-bg2 text-2xl shadow-bd-ink-4">
        {titleEmoji}
      </span>
    )
  }

  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-bd-ink bg-bd-sun text-2xl shadow-[3px_3px_0_#1F1B16]">
      {titleEmoji}
    </span>
  )
}

export default function GameLobbiesPage({
  gameType,
  iconVariant,
  pagePath,
  titleEmoji,
  gameNameKey,
  lobbiesNamespace,
}: GameLobbiesPageProps) {
  const router = useRouter()
  const { status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const { t } = useTranslation()
  const socketRef = useRef<Socket | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated' || isGuest
  const createLobbyPath = getLobbyCreateRoute(gameType) ?? '/lobby/create'
  const canCreateLobby = !isTemporarilyUnavailableGameType(gameType)

  const tx = useCallback(
    (suffix: string) => t(`${lobbiesNamespace}.${suffix}` as TranslationKeys),
    [lobbiesNamespace, t]
  )

  const loadLobbies = useCallback(async () => {
    try {
      const response = await fetchWithGuest(`/api/lobby?gameType=${encodeURIComponent(gameType)}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      if (data.error) {
        clientLogger.warn(`Lobbies loaded with error for ${gameType}:`, data.error)
      }

      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error(`Failed to load lobbies for ${gameType}:`, error)
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }, [gameType])

  useEffect(() => {
    if (status === 'unauthenticated' && !isGuest) {
      setLoading(false)
      return
    }

    if (isGuest && !guestToken) {
      return
    }

    if (status !== 'authenticated' && !isGuest) {
      return
    }

    loadLobbies()
    let isMounted = true

    const refreshInterval = setInterval(() => {
      loadLobbies()
    }, 5000)

    const initSocket = async () => {
      if (socketRef.current) {
        return
      }

      const socketAuth = await resolveSocketClientAuth({
        isGuest: isGuest && status !== 'authenticated',
        guestToken: isGuest && status !== 'authenticated' ? guestToken : null,
      })

      if (!socketAuth) {
        clientLogger.warn(`Skipping lobby socket connection for ${gameType}: auth payload unavailable`)
        return
      }

      if (!isMounted) {
        return
      }

      const nextSocket = io(getBrowserSocketUrl(), {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })

      nextSocket.on('connect', () => {
        nextSocket.emit('join-lobby-list')
      })

      nextSocket.on('lobby-list-update', () => {
        loadLobbies()
      })

      socketRef.current = nextSocket
    }

    void initSocket()

    return () => {
      isMounted = false
      clearInterval(refreshInterval)

      if (socketRef.current?.connected) {
        socketRef.current.emit('leave-lobby-list')
        socketRef.current.disconnect()
      }

      socketRef.current = null
    }
  }, [gameType, guestToken, isGuest, loadLobbies, status])

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }

    if (joinCode.length === 4) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="bd-page bd-screen page-shell">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">

          {/* Breadcrumb */}
          <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-bd-ink-muted sm:text-sm">
            <button onClick={() => router.push('/')} className="hover:text-bd-ink transition-colors">
              🏠 <span className="hidden xs:inline">{t('breadcrumbs.home')}</span>
            </button>
            <span>›</span>
            <button onClick={() => router.push('/games')} className="hover:text-bd-ink transition-colors">
              🎮 <span className="hidden xs:inline">{t('breadcrumbs.games')}</span>
            </button>
            <span>›</span>
            <span className="inline-flex items-center gap-2 text-bd-ink">
              <GameLobbyIcon titleEmoji={titleEmoji} usage="breadcrumb" variant={iconVariant} />
              <span className="hidden xs:inline">{t(gameNameKey)}</span>
            </span>
          </div>

          {/* Header */}
          <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-end">
            <div>
              <span className="bd-kicker">{t(gameNameKey)}</span>
              <h1
                className="mt-3 max-w-2xl text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[0.92] text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {tx('title')}
                <GameLobbyIcon titleEmoji={titleEmoji} usage="title" variant={iconVariant} />
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-bd-ink-soft">
                {isAuthenticated ? tx('subtitle') : tx('subtitleGuest')}
              </p>
            </div>

            <button
              onClick={() => router.push('/games')}
              className="bd-btn bd-btn-ghost self-end justify-center lg:justify-start"
            >
              ← {tx('backToGames')}
            </button>
          </div>

          {/* Guest / unauthenticated CTA */}
          {!isAuthenticated && (
            <div className="mb-6 rounded-2xl border border-bd-sun/40 bg-bd-sun/10 p-5">
              <p className="font-bold text-bd-ink">{tx('wantToPlay')}</p>
              <p className="mt-1 text-sm text-bd-ink-soft">{tx('wantToPlayDesc')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push(`/auth/login?returnUrl=${encodeURIComponent(pagePath)}`)}
                  className="bd-btn bd-btn-primary"
                >
                  {tx('signIn')}
                </button>
                <button
                  onClick={() => router.push(`/auth/register?returnUrl=${encodeURIComponent(pagePath)}`)}
                  className="bd-btn bd-btn-ghost"
                >
                  {tx('createAccount')}
                </button>
              </div>
            </div>
          )}

          {/* Create + Quick Join */}
          <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Create lobby card */}
            <button
              type="button"
              aria-disabled={!canCreateLobby}
              className={`bd-card group relative overflow-hidden p-6 text-left transition-all sm:p-8 ${
                canCreateLobby
                  ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_0_#1F1B16,0_16px_36px_-12px_rgba(31,27,22,0.35)]'
                  : 'cursor-not-allowed opacity-75'
              }`}
              onClick={() => {
                if (!canCreateLobby) return
                if (!isAuthenticated) {
                  router.push(`/auth/login?returnUrl=${encodeURIComponent(createLobbyPath)}`)
                  return
                }
                router.push(createLobbyPath)
              }}
            >
              <div
                className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
                style={{ background: 'var(--bd-sun)' }}
              />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <GameLobbyIcon titleEmoji={titleEmoji} usage="card" variant={iconVariant} />
                  <span className="bd-chip border-bd-ink bg-bd-ink px-3 py-1 text-xs font-bold text-bd-bg">
                    {canCreateLobby ? tx('newGame') : 'Unavailable'}
                  </span>
                </div>
                <h2
                  className="mb-2 text-2xl font-extrabold text-bd-ink"
                  style={{ fontFamily: 'var(--bd-font-display)' }}
                >
                  {canCreateLobby ? tx('createNewLobby') : 'Lobby creation unavailable'}
                </h2>
                <p className="mb-5 text-sm leading-6 text-bd-ink-soft">
                  {canCreateLobby
                    ? tx('createDescription')
                    : 'This game is still being polished. You can check existing rooms below when any are open.'}
                </p>
                <span className="inline-flex items-center gap-2 font-bold text-bd-ink">
                  {canCreateLobby ? tx('createNow') : 'Browse open lobbies'}
                  {canCreateLobby && (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  )}
                </span>
              </div>
            </button>

            {/* Quick join card */}
            <div className="bd-card flex h-full flex-col justify-center p-6 sm:p-8">
              <h2
                className="mb-1 text-xl font-extrabold text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                🔍 {tx('quickJoin')}
              </h2>
              <p className="mb-5 text-sm text-bd-ink-soft">{tx('quickJoinDesc')}</p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder={tx('enterCode')}
                  className="bd-input flex-1 font-mono text-lg uppercase"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 4))}
                  maxLength={4}
                  onKeyDown={(event) => event.key === 'Enter' && handleJoinByCode()}
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={joinCode.length !== 4 || !isAuthenticated}
                  className="bd-btn bd-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('lobby.join')}
                </button>
              </div>
              {!isAuthenticated && (
                <p className="mt-3 text-xs text-bd-ink-muted">{tx('signInToJoin')}</p>
              )}
            </div>
          </div>

          {/* Active lobbies */}
          <div className="bd-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-bd-line bg-bd-card-warm px-5 py-4">
              <h2 className="font-bold text-bd-ink">🎮 {tx('activeLobbies')}</h2>
              <span className="bd-kicker">{lobbies.length}</span>
            </div>

            {lobbies.length === 0 ? (
              <div className="py-16 text-center">
                <GameLobbyIcon titleEmoji={titleEmoji} usage="empty" variant={iconVariant} />
                <p className="font-bold text-bd-ink">{tx('noLobbiesTitle')}</p>
                {isAuthenticated && (
                  <button
                    onClick={() => router.push(createLobbyPath)}
                    disabled={!canCreateLobby}
                    className="bd-btn bd-btn-primary mx-auto mt-5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {canCreateLobby ? tx('createFirstLobby') : 'Creation unavailable'}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-0 md:grid-cols-2 lg:grid-cols-3">
                {lobbies.map((lobby, idx) => {
                  const activeGame = lobby.games.find((game) => game.status === 'waiting' || game.status === 'playing')
                  const playerCount = activeGame?._count?.players ?? 0
                  const isWaiting = activeGame?.status === 'waiting'
                  const isPlaying = activeGame?.status === 'playing'
                  const isFull = playerCount >= lobby.maxPlayers
                  const hostName = lobby.creator?.username || lobby.creator?.email?.split('@')[0] || 'Anonymous'

                  return (
                    <div
                      key={lobby.id}
                      className={`cursor-pointer p-5 transition-colors hover:bg-bd-card-warm ${
                        idx % 3 !== 2 ? 'md:border-r md:border-bd-line' : ''
                      } ${idx < lobbies.length - (lobbies.length % 3 || 3) ? 'border-b border-bd-line' : ''}`}
                      onClick={() => router.push(`/lobby/${lobby.code}`)}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <h3 className="truncate font-bold text-bd-ink">{lobby.name}</h3>
                        <span className="shrink-0 rounded-lg border border-bd-lav/40 bg-bd-lav/15 px-2 py-0.5 font-mono text-xs font-bold text-bd-lav-deep">
                          {lobby.code}
                        </span>
                      </div>

                      <p className="mb-4 truncate text-sm text-bd-ink-muted">
                        👤 {tx('host')}: {hostName}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${isFull ? 'text-bd-sun-deep' : 'text-bd-ink-soft'}`}>
                          👥 {playerCount}/{lobby.maxPlayers}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isWaiting && (
                            <span className="flex items-center gap-1 rounded-full bg-bd-sun/20 px-2.5 py-1 text-[11px] font-bold text-[#9b6b00]">
                              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#9b6b00]" />
                              {tx('waiting')}
                            </span>
                          )}
                          {isPlaying && (
                            <span className="flex items-center gap-1 rounded-full bg-bd-mint/20 px-2.5 py-1 text-[11px] font-bold text-bd-mint-deep">
                              <span className="h-1.5 w-1.5 rounded-full bg-bd-mint-deep" />
                              {tx('playing')}
                            </span>
                          )}
                          {isFull && (
                            <span className="rounded-full bg-bd-coral/15 px-2.5 py-1 text-[11px] font-bold text-bd-coral-deep">
                              {tx('full')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
