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
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'

interface RPSGame {
    id: string
    lobbyCode: string
    gameType: string
    status: 'waiting' | 'playing' | 'finished'
    currentPlayerIndex: number
    players: Array<{ id: string; name: string }>
    data: RockPaperScissorsGameData
}

interface LobbyData {
    id: string
    code: string
    status: 'waiting' | 'playing' | 'finished'
    gameId?: string
    gameType?: string
    game?: RPSGame
}

interface RockPaperScissorsLobbyPageProps {
    code: string
}

export default function RockPaperScissorsLobbyPage({ code }: RockPaperScissorsLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId, guestName } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<LobbyData | null>(null)
    const [socket, setSocket] = useState<Socket | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const socketRef = useRef<Socket | null>(null)
    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

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

        let parsed: any = state
        if (typeof state === 'string') {
            try {
                parsed = JSON.parse(state)
            } catch {
                return defaultState
            }
        }

        const data = parsed?.data
        if (!data || typeof data !== 'object') {
            return defaultState
        }

        return {
            ...defaultState,
            ...data,
            scores: typeof data.scores === 'object' && data.scores ? data.scores : {},
            playerChoices: typeof data.playerChoices === 'object' && data.playerChoices ? data.playerChoices : {},
            rounds: Array.isArray(data.rounds) ? data.rounds : [],
            playersReady: Array.isArray(data.playersReady) ? data.playersReady : [],
        }
    }, [])

    const normalizeLobbyResponse = useCallback((payload: any): LobbyData | null => {
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
                gameType: lobbyPayload.gameType,
            }
        }

        const players = Array.isArray(activeGame.players)
            ? activeGame.players.map((player: any) => ({
                id: player?.userId || player?.id || '',
                name: player?.user?.username || player?.name || 'Unknown',
            }))
            : []

        const normalizedGame: RPSGame = {
            id: activeGame.id,
            lobbyCode: lobbyPayload.code,
            gameType: activeGame.gameType || lobbyPayload.gameType || 'rock_paper_scissors',
            status: activeGame.status,
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
                            .map((player: any) => ({
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
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        )
    }

    if (error || !lobby || !lobby.game) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
                <div className="bg-red-900/30 border border-red-500 rounded-lg p-6 max-w-md text-center">
                    <p className="text-red-200">{error || t('errors.game_not_found')}</p>
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="mt-4 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded"
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">🍂 {t('games.rock_paper_scissors.name')}</h1>
                    <p className="text-gray-400">{t('lobby.game.code')}: {code.toUpperCase()}</p>
                </div>

                {/* Players Info */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    {lobby.game.players.map((player, idx) => (
                        <div
                            key={player.id}
                            className={`${player.id === currentUserId ? 'bg-indigo-900 border-indigo-500' : 'bg-slate-800 border-slate-700'
                                } rounded-lg p-4 border`}
                        >
                            <p className="text-xs text-gray-400">
                                {player.id === currentUserId ? `👤 ${t('lobby.game.you')}` : `👥 ${t('lobby.game.opponent')}`}
                            </p>
                            <p className="text-lg font-bold text-white">{player.name}</p>
                            <p className="text-sm text-indigo-300 mt-2">
                                {t('lobby.game.score')}: <span className="font-bold">{gameData.scores[player.id] || 0}</span>
                            </p>
                        </div>
                    ))}
                </div>

                {/* Game Board */}
                {currentPlayer && (
                    <RockPaperScissorsGameBoard
                        gameData={gameData}
                        playerId={currentPlayer.id}
                        playerName={currentPlayer.name}
                        onSubmitChoice={handleSubmitChoice}
                        isLoading={isSubmitting}
                    />
                )}

                {/* Back to Lobby Button */}
                <div className="mt-8">
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
                    >
                        {t('lobby.game.back_to_lobby')}
                    </button>
                </div>
            </div>
        </div>
    )
}
