'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { SocketEvents, JoinedSpectatorsPayload, SpectatorJoinedPayload, SpectatorLeftPayload, SpectatorChatMessagePayload } from '@/types/socket-events'
import type { Lobby, Game, GamePlayer } from '@/types/game'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function ReadOnlyYahtzeeView({ state, players }: { state: Record<string, any>; players: GamePlayer[] }) {
  const data = (isRecord(state.data) ? state.data : {}) as Record<string, any>
  const dice = Array.isArray(data.dice) ? data.dice : []
  const held = Array.isArray(data.held) ? data.held : []
  const scores = Array.isArray(data.scores) ? data.scores : []
  const currentPlayerIndex =
    typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {dice.map((die: unknown, index: number) => (
          <div
            key={`${index}-${die}`}
            className={`rounded-xl border p-3 text-center text-xl font-bold ${
              held[index] ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            }`}
          >
            {Number(die) || '-'}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border p-3">Rolls Left: {typeof data.rollsLeft === 'number' ? data.rollsLeft : '-'}</div>
        <div className="rounded-lg border p-3">
          Current Turn:{' '}
          {currentPlayerIndex !== null && players[currentPlayerIndex]
            ? players[currentPlayerIndex].user?.username || players[currentPlayerIndex].user?.email || `Player ${currentPlayerIndex + 1}`
            : '-'}
        </div>
      </div>
      <div className="rounded-xl border p-3">
        <h3 className="mb-2 font-semibold">Scorecards</h3>
        <div className="space-y-2">
          {players.map((player: GamePlayer, index: number) => {
            const scorecard = isRecord(scores[index]) ? scores[index] : {}
            const filled = Object.keys(scorecard).length
            const total = Object.values(scorecard).reduce(
              (sum: number, value) => sum + (typeof value === 'number' ? value : 0),
              0
            )
            return (
              <div key={player.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>
                  {player.user?.username || player.user?.email || `Player ${index + 1}`}
                  {currentPlayerIndex === index ? ' • turn' : ''}
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                  score {total} • filled {filled}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ReadOnlyTicTacToeView({ state }: { state: Record<string, any> }) {
  const data = (isRecord(state.data) ? state.data : {}) as Record<string, any>
  const board = Array.isArray(data.board) ? data.board : []
  return (
    <div className="space-y-4">
      <div className="mx-auto grid w-fit grid-cols-3 gap-2 rounded-xl border p-3">
        {board.flatMap((row: unknown, rowIndex: number) =>
          (Array.isArray(row) ? row : [null, null, null]).map((cell: unknown, colIndex: number) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className="flex h-16 w-16 items-center justify-center rounded-lg border bg-gray-50 text-2xl font-bold dark:bg-gray-800"
            >
              {typeof cell === 'string' || typeof cell === 'number' ? cell : ''}
            </div>
          ))
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border p-3">Current Symbol: {data.currentSymbol || '-'}</div>
        <div className="rounded-lg border p-3">Winner: {data.winner || 'None'}</div>
      </div>
    </div>
  )
}

function ReadOnlyRpsView({ state, players }: { state: Record<string, any>; players: GamePlayer[] }) {
  const data = (isRecord(state.data) ? state.data : {}) as Record<string, any>
  const scores = (isRecord(data.scores) ? data.scores : {}) as Record<string, unknown>
  const rounds = Array.isArray(data.rounds) ? data.rounds : []
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        {players.map((player: GamePlayer, index: number) => {
          const playerId = player.userId
          return (
            <div key={player.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>{player.user?.username || player.user?.email || `Player ${index + 1}`}</span>
              <span>Score: {typeof scores[playerId] === 'number' ? scores[playerId] : 0}</span>
            </div>
          )
        })}
      </div>
      <div className="rounded-xl border p-3">
        <div className="mb-2 text-sm font-semibold">Recent Rounds ({rounds.length})</div>
        <div className="space-y-2 text-sm">
          {rounds.slice(-5).map((round: Record<string, unknown>, index: number) => (
            <div key={`${index}-${typeof round.winner === 'string' ? round.winner : 'none'}`} className="rounded-lg border px-3 py-2">
              Winner: {typeof round.winner === 'string' ? round.winner : 'pending'} • choices hidden until reveal logic
            </div>
          ))}
          {rounds.length === 0 && <div className="text-gray-500">No completed rounds yet</div>}
        </div>
      </div>
    </div>
  )
}

function ReadOnlySpyView({ state }: { state: Record<string, any> }) {
  const data = (isRecord(state.data) ? state.data : {}) as Record<string, any>
  const questionHistory = Array.isArray(data.questionHistory) ? data.questionHistory : []
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border p-3">Phase: {data.phase || '-'}</div>
        <div className="rounded-lg border p-3">
          Round: {data.currentRound || '-'} / {data.totalRounds || '-'}
        </div>
        <div className="rounded-lg border p-3">Location: {data.location || 'Hidden / not started'}</div>
        <div className="rounded-lg border p-3">
          Questions: {questionHistory.length}
        </div>
      </div>
      <div className="rounded-xl border p-3">
        <div className="mb-2 text-sm font-semibold">Recent Q&A (sanitized)</div>
        <div className="space-y-2 text-sm">
          {questionHistory.slice(-5).map((entry: Record<string, unknown>, index: number) => (
            <div key={`${index}-${typeof entry.timestamp === 'number' ? entry.timestamp : index}`} className="rounded-lg border px-3 py-2">
              <div className="font-medium">
                {typeof entry.askerName === 'string' ? entry.askerName : 'Player'} → {typeof entry.targetName === 'string' ? entry.targetName : 'Player'}
              </div>
              <div className="text-gray-600 dark:text-gray-300">{typeof entry.question === 'string' ? entry.question : '-'}</div>
              <div className="text-gray-500 dark:text-gray-400">{typeof entry.answer === 'string' ? entry.answer : '-'}</div>
            </div>
          ))}
          {questionHistory.length === 0 && <div className="text-gray-500">No questions yet</div>}
        </div>
      </div>
    </div>
  )
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
    return <div className="text-sm text-gray-500">Game state unavailable</div>
  }

  switch (gameType) {
    case 'yahtzee':
      return <ReadOnlyYahtzeeView state={parsedState} players={players} />
    case 'tic_tac_toe':
      return <ReadOnlyTicTacToeView state={parsedState} />
    case 'rock_paper_scissors':
      return <ReadOnlyRpsView state={parsedState} players={players} />
    case 'guess_the_spy':
      return <ReadOnlySpyView state={parsedState} />
    default:
      return <div className="text-sm text-gray-500">No specialized spectator board for this game yet.</div>
  }
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
    return <div className="min-h-screen flex items-center justify-center">Loading spectator view...</div>
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-xl border p-6 bg-white dark:bg-gray-900">
          <h1 className="text-xl font-bold mb-2">Spectator mode unavailable</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">{error || 'No data'}</p>
          <button
            type="button"
            onClick={() => router.push('/lobby')}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white"
          >
            Back to lobbies
          </button>
        </div>
      </div>
    )
  }

  const players = Array.isArray(data.activeGame?.players) ? data.activeGame.players : []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Spectator Mode
              </div>
              <h1 className="text-2xl font-bold">{data.lobby.name}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Lobby {data.lobby.code} • {data.activeGame?.status || 'waiting'}
              </p>
            </div>
            <div className="flex gap-2">
              {data.canJoinAsPlayer && (
                <button
                  type="button"
                  onClick={joinAsPlayer}
                  disabled={joiningAsPlayer}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold disabled:opacity-60"
                >
                  {joiningAsPlayer ? 'Joining...' : 'Join as Player'}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push(`/lobby/${code}`)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold"
              >
                Open Lobby
              </button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border bg-white p-4 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Read-only Game Snapshot</h2>
              <span className="text-xs rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">
                {data.lobby.gameType}
              </span>
            </div>
            <div className="mb-4">
              <ReadOnlySpectatorBoard
                gameType={String(data.lobby.gameType || '')}
                parsedState={isRecord(parsedState) ? parsedState : null}
                players={players}
              />
            </div>
            <details className="rounded-xl bg-gray-950 p-4 text-xs text-gray-100 overflow-auto">
              <summary className="cursor-pointer font-semibold text-gray-200">Raw Snapshot JSON</summary>
              <pre className="mt-3 max-h-[420px] overflow-auto">{JSON.stringify(parsedState ?? data.activeGame ?? {}, null, 2)}</pre>
            </details>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-4 dark:bg-gray-900">
              <h2 className="mb-3 text-lg font-bold">Players ({players.length}/{data.lobby.maxPlayers})</h2>
              <div className="space-y-2">
                {players.map((player: GamePlayer) => (
                  <div key={player.id} className="rounded-lg border px-3 py-2 text-sm">
                    {player.user?.username || player.user?.email || 'Player'}
                  </div>
                ))}
                {players.length === 0 && <div className="text-sm text-gray-500">No players yet</div>}
              </div>
            </div>

            <details className="rounded-2xl border bg-white p-4 dark:bg-gray-900" open>
              <summary className="cursor-pointer font-bold">
                Spectators ({spectatorCount})
              </summary>
              <div className="mt-3 space-y-2">
                {spectators.map((spectator) => (
                  <div key={spectator.userId} className="rounded-lg border px-3 py-2 text-sm">
                    {spectator.username}
                  </div>
                ))}
                {spectators.length === 0 && (
                  <div className="text-sm text-gray-500">No spectators connected</div>
                )}
              </div>
            </details>

            <div className="rounded-2xl border bg-white p-4 text-sm dark:bg-gray-900">
              <h3 className="font-bold mb-2">Notes</h3>
              <p className="text-gray-600 dark:text-gray-300">
                This spectator view is read-only. Interactive game controls and player chat are disabled.
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-4 dark:bg-gray-900">
              <h3 className="font-bold mb-3">Spectator Chat</h3>
              <div className="mb-3 max-h-52 overflow-auto space-y-2 rounded-xl border bg-gray-50 p-3 dark:bg-gray-950">
                {chatMessages.length === 0 && (
                  <div className="text-sm text-gray-500">No spectator messages yet</div>
                )}
                {chatMessages.map((message) => (
                  <div key={message.id} className="text-sm">
                    <span className="font-semibold">{message.username}: </span>
                    <span className="text-gray-700 dark:text-gray-300">{message.message}</span>
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
                  className="flex-1 rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-950"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
