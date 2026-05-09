'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import LoadingSpinner from '@/components/LoadingSpinner'
import { SocketEvents, JoinedSpectatorsPayload, SpectatorJoinedPayload, SpectatorLeftPayload, SpectatorChatMessagePayload } from '@/types/socket-events'
import type { Lobby, Game, GamePlayer } from '@/types/game'
import { SPECTATOR_VIEWS } from './views'

type SpectatorUser = {
  userId: string
  username: string
}

type SpectatorLobbyResponse = {
  lobby: Lobby
  activeGame: Game | null
  canJoinAsPlayer: boolean
}

type SpectatorChatMessage = {
  id: string
  userId: string
  username: string
  lobbyCode: string
  message: string
  timestamp?: number
}

function ReadOnlySpectatorBoard({
  gameType,
  parsedState,
  players,
}: {
  gameType: string
  parsedState: Record<string, any> | null
  players: GamePlayer[]
}) {
  if (!parsedState) {
    return <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-sm font-medium text-bd-ink-muted">Game state unavailable</div>
  }
  const View = SPECTATOR_VIEWS[gameType]
  if (!View) {
    return <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-sm font-medium text-bd-ink-muted">No spectator view for this game yet.</div>
  }
  return <View state={parsedState} players={players} />
}

export default function SpectatorLobbyPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { isGuest, guestToken } = useGuest()
  const code = String(params.code || '').toUpperCase()

  const [data, setData] = useState<SpectatorLobbyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [spectators, setSpectators] = useState<SpectatorUser[]>([])
  const [spectatorCount, setSpectatorCount] = useState(0)
  const [joiningAsPlayer, setJoiningAsPlayer] = useState(false)
  const [chatMessages, setChatMessages] = useState<SpectatorChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const socketRef = useRef<Socket | null>(null)

  const parsedState = useMemo(() => {
    const raw = data?.activeGame?.state
    if (typeof raw !== 'string') return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }, [data?.activeGame?.state])

  const loadSnapshot = useCallback(async () => {
    if (!code) return
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}/spectate`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      setData(json)
      setSpectatorCount(json?.lobby?.spectatorCount ?? 0)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spectator view')
    } finally {
      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    if (!code) return
    if (isGuest && !guestToken) return

    let socket: Socket | null = null
    let disposed = false

    const setup = async () => {
      const socketAuth = await resolveSocketClientAuth({
        isGuest: Boolean(isGuest),
        guestToken: guestToken ?? null,
      })
      if (!socketAuth || disposed) return

      socket = io(getBrowserSocketUrl(), {
        transports: ['websocket', 'polling'],
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })
      socketRef.current = socket

      socket.on('connect', () => {
        socket?.emit(SocketEvents.JOIN_SPECTATORS, code)
      })

      socket.on(SocketEvents.JOINED_SPECTATORS, (payload: JoinedSpectatorsPayload) => {
        if (payload?.lobbyCode !== code) return
        setSpectators(Array.isArray(payload?.spectators) ? payload.spectators : [])
        setSpectatorCount(typeof payload?.count === 'number' ? payload.count : 0)
      })

      socket.on(SocketEvents.SPECTATOR_JOINED, (payload: SpectatorJoinedPayload) => {
        if (payload?.lobbyCode !== code) return
        if (typeof payload?.count === 'number') {
          setSpectatorCount(payload.count)
        }
        if (typeof payload?.userId === 'string' && typeof payload?.username === 'string') {
          setSpectators((prev) =>
            prev.some((s) => s.userId === payload.userId)
              ? prev
              : [...prev, { userId: payload.userId, username: payload.username }]
          )
        }
      })

      socket.on(SocketEvents.SPECTATOR_LEFT, (payload: SpectatorLeftPayload) => {
        if (payload?.lobbyCode !== code) return
        if (typeof payload?.count === 'number') {
          setSpectatorCount(payload.count)
        }
        if (typeof payload?.userId === 'string') {
          setSpectators((prev) => prev.filter((s) => s.userId !== payload.userId))
        }
      })

      socket.on(SocketEvents.SPECTATOR_CHAT_MESSAGE, (payload: SpectatorChatMessagePayload) => {
        if (payload?.lobbyCode !== code) return
        if (typeof payload?.id !== 'string' || typeof payload?.message !== 'string') return
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev
          const next = [...prev, payload as SpectatorChatMessage]
          return next.slice(-100)
        })
      })

      const refetch = () => void loadSnapshot()
      socket.on(SocketEvents.GAME_UPDATE, refetch)
      socket.on(SocketEvents.LOBBY_UPDATE, refetch)
      socket.on(SocketEvents.GAME_STARTED, refetch)
      socket.on(SocketEvents.GAME_ABANDONED, refetch)
      socket.on(SocketEvents.PLAYER_JOINED, refetch)
      socket.on(SocketEvents.PLAYER_LEFT, refetch)
    }

    void setup()

    return () => {
      disposed = true
      if (socket) {
        socket.emit(SocketEvents.LEAVE_SPECTATORS, code)
        socket.disconnect()
      }
      socketRef.current = null
    }
  }, [code, guestToken, isGuest, loadSnapshot, session?.user?.id])

  const sendSpectatorChatMessage = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const message = chatInput.trim()
      if (!message) return
      if (!socketRef.current || socketRef.current.disconnected) {
        setError('Spectator chat is unavailable while disconnected')
        return
      }
      socketRef.current.emit(SocketEvents.SEND_SPECTATOR_CHAT_MESSAGE, {
        lobbyCode: code,
        message,
      })
      setChatInput('')
    },
    [chatInput, code]
  )

  const joinAsPlayer = useCallback(async () => {
    if (!data?.canJoinAsPlayer || joiningAsPlayer) return
    setJoiningAsPlayer(true)
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      router.push(`/lobby/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join as player')
    } finally {
      setJoiningAsPlayer(false)
    }
  }, [code, data?.canJoinAsPlayer, joiningAsPlayer, router])

  if (loading) {
    return (
      <div className="bd-page bd-screen flex min-h-[calc(100dvh-64px)] items-center justify-center p-6">
        <div className="bd-card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="font-display text-2xl font-black text-bd-ink">Opening spectator view</h1>
            <p className="mt-2 text-sm text-bd-ink-muted">Loading the latest lobby snapshot.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bd-page bd-screen flex min-h-[calc(100dvh-64px)] items-center justify-center p-6">
        <div className="bd-card w-full max-w-xl p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm text-2xl shadow-[0_3px_0_var(--bd-line)]">
            👀
          </div>
          <h1 className="font-display text-2xl font-black text-bd-ink">Spectator mode unavailable</h1>
          <p className="mt-2 text-sm text-bd-ink-muted">{error || 'No data'}</p>
          <button
            type="button"
            onClick={() => router.push('/lobby')}
            className="bd-btn bd-btn-primary mx-auto mt-5"
          >
            Back to lobbies
          </button>
        </div>
      </div>
    )
  }

  const players = Array.isArray(data.activeGame?.players) ? data.activeGame.players : []

  return (
    <div className="bd-page bd-screen min-h-[calc(100dvh-64px)] text-bd-ink">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="bd-card relative mb-6 overflow-hidden p-5 sm:p-6">
          <div className="bd-dot-grid pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="bd-kicker mb-2 block">Spectator mode</span>
              <h1 className="font-display text-3xl font-black leading-tight text-bd-ink sm:text-4xl">{data.lobby.name}</h1>
              <p className="mt-2 text-sm font-medium text-bd-ink-muted">
                Lobby <span className="font-mono font-bold text-bd-ink">{data.lobby.code}</span> · {data.activeGame?.status || 'waiting'}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {data.canJoinAsPlayer && (
                <button
                  type="button"
                  onClick={joinAsPlayer}
                  disabled={joiningAsPlayer}
                  className="bd-btn bd-btn-coral justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {joiningAsPlayer ? 'Joining...' : 'Join as Player'}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push(`/lobby/${code}`)}
                className="bd-btn bd-btn-soft justify-center"
              >
                Open Lobby
              </button>
            </div>
          </div>
          {error && <p className="relative mt-4 rounded-2xl border border-bd-coral/30 bg-bd-coral/10 px-4 py-3 text-sm font-medium text-bd-coral-deep">{error}</p>}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="bd-card p-4 sm:p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-black text-bd-ink">Live game snapshot</h2>
              <span className="bd-chip text-xs">
                {data.lobby.gameType}
              </span>
            </div>
            <div className="mb-4">
              <ReadOnlySpectatorBoard
                gameType={String(data.lobby.gameType || '')}
                parsedState={parsedState}
                players={players}
              />
            </div>
            <details className="rounded-xl bg-gray-950 p-4 text-xs text-gray-100 overflow-auto">
              <summary className="cursor-pointer font-semibold text-gray-200">Raw Snapshot JSON</summary>
              <pre className="mt-3 max-h-[420px] overflow-auto">{JSON.stringify(parsedState ?? data.activeGame ?? {}, null, 2)}</pre>
            </details>
          </section>

          <div className="space-y-4">
            <section className="bd-card p-4">
              <h2 className="mb-3 font-display text-lg font-black">Players ({players.length}/{data.lobby.maxPlayers})</h2>
              <div className="space-y-2">
                {players.map((player: GamePlayer) => (
                  <div key={player.id} className="rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2 text-sm font-semibold text-bd-ink-soft">
                    {player.user?.username || player.user?.email || 'Player'}
                  </div>
                ))}
                {players.length === 0 && <div className="text-sm text-bd-ink-muted">No players yet</div>}
              </div>
            </section>

            <details className="bd-card p-4" open>
              <summary className="cursor-pointer font-display text-lg font-black">
                Spectators ({spectatorCount})
              </summary>
              <div className="mt-3 space-y-2">
                {spectators.map((spectator) => (
                  <div key={spectator.userId} className="rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2 text-sm font-semibold text-bd-ink-soft">
                    {spectator.username}
                  </div>
                ))}
                {spectators.length === 0 && (
                  <div className="text-sm text-bd-ink-muted">No spectators connected</div>
                )}
              </div>
            </details>

            <section className="rounded-[1.5rem] border border-bd-line bg-bd-card-warm p-4 text-sm">
              <h3 className="mb-2 font-display text-lg font-black">Good to know</h3>
              <p className="font-medium leading-relaxed text-bd-ink-muted">
                You can watch the game here without changing the board. Player controls stay locked unless you join as a player.
              </p>
            </section>

            <section className="bd-card p-4">
              <h3 className="mb-3 font-display text-lg font-black">Spectator Chat</h3>
              <div className="mb-3 max-h-52 space-y-2 overflow-auto rounded-2xl border border-bd-line bg-bd-card-warm p-3">
                {chatMessages.length === 0 && (
                  <div className="text-sm text-bd-ink-muted">No spectator messages yet</div>
                )}
                {chatMessages.map((message) => (
                  <div key={message.id} className="text-sm">
                    <span className="font-semibold">{message.username}: </span>
                    <span className="text-bd-ink-soft">{message.message}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={sendSpectatorChatMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Say something to spectators..."
                  maxLength={500}
                  className="bd-input min-w-0 flex-1 text-sm"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bd-btn bd-btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
