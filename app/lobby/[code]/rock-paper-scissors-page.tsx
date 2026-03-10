'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import LoadingSpinner from '@/components/LoadingSpinner'
import RockPaperScissorsGameBoard from '@/components/RockPaperScissorsGameBoard'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'
import { clientLogger } from '@/lib/client-logger'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse, type LobbySnapshotLike } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'

type RpsLifecycleStatus = 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled'

interface RPSGame {
    id: string
    lobbyCode: string
    gameType: string
    status: RpsLifecycleStatus
    currentPlayerIndex: number
    players: Array<{ id: string; name: string }>
    data: RockPaperScissorsGameData
}

interface LobbyData {
    id: string
    code: string
    status: RpsLifecycleStatus
    isActive?: boolean
    gameId?: string
    gameType?: string
    game?: RPSGame
}

interface RockPaperScissorsLobbyPageProps {
    code: string
}

const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600

export default function RockPaperScissorsLobbyPage({ code }: RockPaperScissorsLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId, guestName } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<LobbyData | null>(null)
    const [socket, setSocket] = useState<Socket | null>(null)
    const [socketConnected, setSocketConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const socketRef = useRef<Socket | null>(null)
    const lifecycleRedirectInFlightRef = useRef(false)
    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    useEffect(() => {
        void router.prefetch('/games')
    }, [router])

    const triggerLifecycleRedirect = useCallback((reason: string) => {
        if (lifecycleRedirectInFlightRef.current) {
            return
        }

        lifecycleRedirectInFlightRef.current = true
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'rps-lifecycle-redirect' })
        clientLogger.warn('RPS lifecycle redirect triggered', {
            code,
            reason,
            target: '/games',
        })
        router.replace('/games')

        if (typeof window !== 'undefined') {
            window.setTimeout(() => {
                if (window.location.pathname.startsWith(`/lobby/${code}`)) {
                    window.location.assign('/games')
                }
            }, LIFECYCLE_REDIRECT_FALLBACK_MS)
        }
    }, [router, code])

    const parseRpsState = useCallback((state: unknown): RockPaperScissorsGameData => {
        const defaultState: RockPaperScissorsGameData = {
            mode: 'best-of-3',
            rounds: [],
            playerChoices: {},
            scores: {},
            playersReady: [],
            gameWinner: null,
        }

        if (!state) return defaultState

        let parsed: unknown = state
        if (typeof state === 'string') {
            try {
                parsed = JSON.parse(state)
            } catch {
                return defaultState
            }
        }

        const data = (parsed as Record<string, unknown>)?.data
        if (!data || typeof data !== 'object') {
            return defaultState
        }

        const dataRecord = data as Record<string, unknown>
        return {
            ...defaultState,
            mode: (dataRecord.mode as RockPaperScissorsGameData['mode']) ?? defaultState.mode,
            gameWinner: typeof dataRecord.gameWinner === 'string' ? dataRecord.gameWinner : null,
            scores: typeof dataRecord.scores === 'object' && dataRecord.scores ? dataRecord.scores as Record<string, number> : {},
            playerChoices: typeof dataRecord.playerChoices === 'object' && dataRecord.playerChoices ? dataRecord.playerChoices as Record<string, RPSChoice | null> : {},
            rounds: Array.isArray(dataRecord.rounds) ? dataRecord.rounds as RockPaperScissorsGameData['rounds'] : [],
            playersReady: Array.isArray(dataRecord.playersReady) ? dataRecord.playersReady as string[] : [],
        }
    }, [])

    const normalizeLobbyResponse = useCallback((payload: LobbySnapshotLike | null | undefined): LobbyData | null => {
        const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(payload, {
            includeFinished: true,
        })

        if (!lobbyPayload?.id || !lobbyPayload?.code) {
            return null
        }

        if (!activeGame) {
            return {
                id: lobbyPayload.id,
                code: lobbyPayload.code,
                status: 'waiting',
                isActive: lobbyPayload.isActive,
                gameType: lobbyPayload.gameType,
            }
        }

        const players = Array.isArray(activeGame.players)
            ? activeGame.players.map((player: Record<string, unknown>) => ({
                id: String(player?.userId || player?.id || ''),
                name: String((player?.user as Record<string, unknown>)?.username || player?.name || 'Unknown'),
            }))
            : []

        const normalizedStatus: RpsLifecycleStatus =
            activeGame.status === 'waiting' ||
            activeGame.status === 'playing' ||
            activeGame.status === 'finished' ||
            activeGame.status === 'abandoned' ||
            activeGame.status === 'cancelled'
                ? activeGame.status
                : 'waiting'

        const normalizedGame: RPSGame = {
            id: activeGame.id,
            lobbyCode: lobbyPayload.code,
            gameType: activeGame.gameType || lobbyPayload.gameType || 'rock_paper_scissors',
            status: normalizedStatus,
            currentPlayerIndex: typeof activeGame.currentPlayerIndex === 'number'
                ? activeGame.currentPlayerIndex
                : 0,
            players,
            data: parseRpsState(activeGame.state),
        }

        return {
            id: lobbyPayload.id,
            code: lobbyPayload.code,
            status: normalizedGame.status,
            isActive: lobbyPayload.isActive,
            gameId: normalizedGame.id,
            gameType: lobbyPayload.gameType,
            game: normalizedGame,
        }
    }, [parseRpsState])

    // Load lobby from API
    const loadLobbyData = useCallback(async () => {
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!res.ok) throw new Error('Failed to load lobby')
            const data = await res.json()
            const normalizedLobby = normalizeLobbyResponse(data)
            if (!normalizedLobby) {
                throw new Error('Invalid lobby response')
            }
            setLobby(normalizedLobby)
            finalizePendingLobbyCreateMetric({
                lobbyCode: normalizedLobby.code,
                fallbackGameType: normalizedLobby.gameType,
            })
        } catch (err) {
            clientLogger.error('Failed to load lobby:', err)
            setError(t('errors.failed_to_load_lobby'))
        } finally {
            setLoading(false)
        }
    }, [code, t, normalizeLobbyResponse])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({
            gameStatus: lobby?.status,
            lobbyIsActive: lobby?.isActive,
        })

        if (redirectReason) {
            triggerLifecycleRedirect(redirectReason)
        }
    }, [lobby?.status, lobby?.isActive, triggerLifecycleRedirect])

    // Initialize Socket.IO connection
    useEffect(() => {
        if (status === 'loading') return
        if (!isGuest && status === 'unauthenticated') {
            router.push('/')
            return
        }
        if (isGuest && !guestToken) return

        let isMounted = true

        const initSocket = async () => {
            try {
                // Load initial lobby data
                await loadLobbyData()
                if (!isMounted) return

                // Initialize Socket.IO
                const socketUrl = getBrowserSocketUrl()
                const useGuestAuth = isGuest && status !== 'authenticated'
                const socketAuth = await resolveSocketClientAuth({
                    isGuest: useGuestAuth,
                    guestToken: useGuestAuth ? guestToken : null,
                })

                if (!socketAuth) {
                    clientLogger.warn('Skipping RPS socket connection: auth payload unavailable')
                    return
                }

                const newSocket = io(socketUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    reconnectionAttempts: 5,
                    auth: socketAuth.authPayload,
                    query: socketAuth.queryPayload,
                })

                if (!isMounted) {
                    newSocket.close()
                    return
                }

                socketRef.current = newSocket
                setSocket(newSocket)

                newSocket.on('connect', () => {
                    if (!isMounted) return
                    newSocket.emit('join-lobby', code)
                    setSocketConnected(true)
                    clientLogger.log('🔌 RPS: Connected to Socket.IO and joined lobby')
                })

                // Listen for updates
                newSocket.on('game-update', async () => {
                    await loadLobbyData()
                    clientLogger.log('📡 RPS: Received game update')
                })

                newSocket.on('lobby-update', async () => {
                    await loadLobbyData()
                    clientLogger.log('📡 RPS: Received lobby update')
                })

                newSocket.on('disconnect', () => {
                    setSocketConnected(false)
                    clientLogger.log('🔌 RPS: Socket disconnected')
                })
            } catch (err) {
                clientLogger.error('RPS socket error:', err)
            }
        }

        initSocket()

        return () => {
            isMounted = false
            if (socketRef.current) {
                socketRef.current.emit('leave-lobby', code)
                socketRef.current.disconnect()
                socketRef.current = null
            }
            setSocketConnected(false)
        }
    }, [code, status, isGuest, guestToken, loadLobbyData, router, session?.user?.id])

    const handleSubmitChoice = async (choice: RPSChoice) => {
        if (!lobby?.game) return

        const previousLobby = lobby
        const submitStartedAt = Date.now()
        let responseStatus: number | undefined
        let moveMetricTracked = false
        setIsSubmitting(true)
        setError(null)
        try {
            const userId = getCurrentUserId()
            if (!userId) {
                throw new Error('Missing user id')
            }

            setLobby((prevLobby) => {
                if (!prevLobby?.game) return prevLobby

                const previousReady = Array.isArray(prevLobby.game.data.playersReady)
                    ? prevLobby.game.data.playersReady
                    : []
                const playersReady = previousReady.includes(userId)
                    ? previousReady
                    : [...previousReady, userId]

                return {
                    ...prevLobby,
                    game: {
                        ...prevLobby.game,
                        data: {
                            ...prevLobby.game.data,
                            playerChoices: {
                                ...prevLobby.game.data.playerChoices,
                                [userId]: choice,
                            },
                            playersReady,
                        },
                    },
                }
            })

            const res = await fetchWithGuest(`/api/game/${lobby.game.id}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: lobby.game.id,
                    move: {
                        type: 'submit-choice',
                        playerId: userId,
                        data: { choice },
                    },
                    userId,
                }),
            })
            responseStatus = res.status

            const payload = await res.json().catch(() => null)
            if (!res.ok) {
                trackMoveSubmitApplied({
                    gameType: 'rock_paper_scissors',
                    moveType: 'submit-choice',
                    durationMs: Date.now() - submitStartedAt,
                    isGuest,
                    success: false,
                    applied: false,
                    statusCode: responseStatus,
                    source: 'rock_paper_scissors_page',
                })
                moveMetricTracked = true
                throw new Error(payload?.message || payload?.error || 'Failed to submit choice')
            }

            const authoritativeState = payload?.game?.state
            if (authoritativeState) {
                const parsedState = authoritativeState as { currentPlayerIndex?: unknown }
                const normalizedData = parseRpsState(authoritativeState)

                setLobby((prevLobby) => {
                    if (!prevLobby?.game) return prevLobby

                    const responsePlayers = Array.isArray(payload?.game?.players)
                        ? payload.game.players
                            .map((player: Record<string, unknown>) => ({
                                id: typeof player?.id === 'string' ? player.id : '',
                                name: typeof player?.name === 'string' ? player.name : 'Unknown',
                            }))
                            .filter((player: { id: string }) => player.id.length > 0)
                        : prevLobby.game.players

                    return {
                        ...prevLobby,
                        status: payload?.game?.status ?? prevLobby.status,
                        game: {
                            ...prevLobby.game,
                            status: payload?.game?.status ?? prevLobby.game.status,
                            currentPlayerIndex: typeof parsedState.currentPlayerIndex === 'number'
                                ? parsedState.currentPlayerIndex
                                : prevLobby.game.currentPlayerIndex,
                            players: responsePlayers,
                            data: normalizedData,
                        },
                    }
                })
            } else {
                void loadLobbyData()
            }

            trackMoveSubmitApplied({
                gameType: 'rock_paper_scissors',
                moveType: 'submit-choice',
                durationMs: Date.now() - submitStartedAt,
                isGuest,
                success: true,
                applied: true,
                statusCode: responseStatus,
                source: 'rock_paper_scissors_page',
            })
            moveMetricTracked = true

            clientLogger.log(`🎮 RPS: Submitted choice: ${choice}`)
            showToast.success('lobby.game.move_submitted')
        } catch (err) {
            if (!moveMetricTracked) {
                trackMoveSubmitApplied({
                    gameType: 'rock_paper_scissors',
                    moveType: 'submit-choice',
                    durationMs: Date.now() - submitStartedAt,
                    isGuest,
                    success: false,
                    applied: false,
                    statusCode: responseStatus,
                    source: 'rock_paper_scissors_page',
                })
            }
            clientLogger.error('Failed to submit choice:', err)
            setLobby(previousLobby)
            const errorMessage = err instanceof Error ? err.message : t('errors.generic')
            setError(errorMessage)
            showToast.error('errors.general', undefined, { message: errorMessage })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        )
    }

    if (error || !lobby || !lobby.game) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
                <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm max-w-md text-center">
                    <p className="text-rose-700">{error || t('errors.gameNotFound')}</p>
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="mt-4 rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white transition hover:bg-rose-500"
                    >
                        {t('common.back')}
                    </button>
                </div>
            </div>
        )
    }

    const currentUserId = getCurrentUserId()
    const currentPlayer = lobby.game.players.find((p) => p.id === currentUserId)
    const gameData = lobby.game.data as RockPaperScissorsGameData

    if (!currentPlayer) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-md text-center">
                    <p className="text-slate-700 mb-4">You are not part of this match.</p>
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700"
                    >
                        {t('lobby.game.back_to_lobby')}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 px-4 py-5 sm:px-6 sm:py-8">
            <div className="mx-auto max-w-5xl space-y-5">
                <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
                                🍂 {t('games.rock_paper_scissors.name')}
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                {t('lobby.game.code')}: <span className="font-mono font-semibold">{code.toUpperCase()}</span>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                    socketConnected
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                }`}
                            >
                                <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                {socketConnected ? 'Live updates' : 'Reconnecting'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                {gameData.mode === 'best-of-3' ? 'First to 2' : 'First to 3'}
                            </span>
                            {socket && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                    {lobby.game.players.length} players
                                </span>
                            )}
                        </div>
                    </div>
                </header>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <section>
                        <RockPaperScissorsGameBoard
                            gameData={gameData}
                            playerId={currentPlayer.id}
                            playerName={currentPlayer.name}
                            players={lobby.game.players}
                            onSubmitChoice={handleSubmitChoice}
                            isLoading={isSubmitting}
                        />
                    </section>

                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-slate-800">How this match works</p>
                            <ul className="mt-2 space-y-2 text-sm text-slate-600">
                                <li>1. Pick one option each round.</li>
                                <li>2. Both choices reveal at the same time.</li>
                                <li>3. First to required wins takes the match.</li>
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-slate-800 mb-2">Rules</p>
                            <div className="space-y-2 text-sm text-slate-600">
                                <p>🪨 Rock beats ✂️ Scissors</p>
                                <p>✂️ Scissors beats 📄 Paper</p>
                                <p>📄 Paper beats 🪨 Rock</p>
                            </div>
                        </div>

                        <button
                            onClick={() => router.push(`/lobby/${code}`)}
                            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700"
                        >
                            {t('lobby.game.back_to_lobby')}
                        </button>
                    </aside>
                </div>
            </div>
        </div>
    )
}
