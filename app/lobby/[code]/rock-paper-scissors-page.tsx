'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import RockPaperScissorsGameBoard from '@/components/RockPaperScissorsGameBoard'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse, type LobbySnapshotLike } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { getLobbyTheme } from '@/lib/lobby-themes'

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
    theme?: string
}

interface RockPaperScissorsLobbyPageProps {
    code: string
    isSpectator?: boolean
}

const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600

export default function RockPaperScissorsLobbyPage({ code, isSpectator = false }: RockPaperScissorsLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId, guestName } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<LobbyData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)


    const lifecycleRedirectInFlightRef = useRef(false)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'rock_paper_scissors').minPlayersRequired
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
            setError(t('errors.failedToLoad'))
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

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 RPS game abandoned:', data)

        void loadLobbyData()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobbyData, triggerLifecycleRedirect])

    const handlePlayerLeft = useCallback((data: {
        userId: string
        username?: string
        playerName?: string
        remainingPlayers?: number
    }) => {
        clientLogger.log('📡 RPS player left:', data)

        const departedPlayerName = data.username || data.playerName
        if (departedPlayerName) {
            showToast.info('toast.playerLeft', undefined, { player: departedPlayerName })
        }

        if (typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
            triggerLifecycleRedirect('player-left:insufficient-players')
            return
        }

        void loadLobbyData()
    }, [loadLobbyData, minPlayersRequired, triggerLifecycleRedirect])

    useEffect(() => {
        if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
        if (isGuest && !guestToken) return
        void loadLobbyData()
    }, [status, isGuest, guestToken, loadLobbyData])

    const handleGameUpdate = useCallback(async (_payload: unknown) => {
        await loadLobbyData()
        clientLogger.log('📡 RPS: Received game update')
    }, [loadLobbyData])

    const handleLobbyUpdate = useCallback(async (_data: unknown) => {
        await loadLobbyData()
        clientLogger.log('📡 RPS: Received lobby update')
    }, [loadLobbyData])

    const { isConnected: socketConnected } = useRealtimeConnection({
        code,
        shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken)),
        onGameUpdate: handleGameUpdate,
        onLobbyUpdate: handleLobbyUpdate,
        onGameAbandoned: handleGameAbandoned,
        onPlayerLeft: handlePlayerLeft,
    })

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
            <div className="min-h-[100dvh] bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        )
    }

    if (error || !lobby || !lobby.game) {
        return (
            <div className="min-h-[100dvh] bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
                <div className="rounded-2xl border border-rose-200 bg-[var(--bd-bg)] p-6 shadow-sm max-w-md text-center">
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

    if (!currentPlayer && !isSpectator) {
        return (
            <div className="min-h-[100dvh] bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
                <div className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-6 shadow-sm max-w-md text-center">
                    <p className="text-bd-ink-soft mb-4">You are not part of this match.</p>
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="rounded-xl bd-btn bd-btn-primary px-4 py-2 font-semibold transition"
                    >
                        {t('lobby.game.back_to_lobby')}
                    </button>
                </div>
            </div>
        )
    }

    const themeColors = getLobbyTheme(lobby?.theme)

    return (
        <div className="h-[calc(100dvh-4rem)] overflow-y-auto" style={{ background: themeColors.bg, color: themeColors.text }}>
        <div className="px-4 py-5 sm:px-6 sm:py-8 min-h-full">
            <div className="mx-auto max-w-5xl space-y-5">
                <header className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-extrabold text-bd-ink sm:text-3xl">
                                🍂 {t('games.rock_paper_scissors.name')}
                            </h1>
                            <p className="mt-1 text-sm text-bd-ink-muted">
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
                                {socketConnected ? t('games.rock_paper_scissors.liveUpdates') : t('games.rock_paper_scissors.reconnecting')}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bd-chip px-3 py-1 text-xs font-semibold">
                                {t('games.rock_paper_scissors.firstTo', { count: gameData.mode === 'best-of-3' ? 2 : 3 })}
                            </span>
                            <span className="inline-flex items-center rounded-full bd-chip px-3 py-1 text-xs font-semibold">
                                {t('games.rock_paper_scissors.playersCount', { count: lobby.game.players.length })}
                            </span>
                        </div>
                    </div>
                </header>

                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px]">
                    <section>
                        <RockPaperScissorsGameBoard
                            gameData={gameData}
                            playerId={isSpectator ? '' : currentPlayer!.id}
                            playerName={isSpectator ? t('game.ui.spectator') : currentPlayer!.name}
                            players={lobby.game.players}
                            onSubmitChoice={handleSubmitChoice}
                            isLoading={isSpectator || isSubmitting}
                        />
                    </section>

                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-4 shadow-sm">
                            <p className="text-sm font-semibold text-bd-ink">{t('games.rock_paper_scissors.howItWorksTitle')}</p>
                            <ul className="mt-2 space-y-2 text-sm text-bd-ink-muted">
                                <li>1. {t('games.rock_paper_scissors.howItWorks1')}</li>
                                <li>2. {t('games.rock_paper_scissors.howItWorks2')}</li>
                                <li>3. {t('games.rock_paper_scissors.howItWorks3')}</li>
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-4 shadow-sm">
                            <p className="text-sm font-semibold text-bd-ink mb-2">{t('games.rock_paper_scissors.rulesTitle')}</p>
                            <div className="space-y-2 text-sm text-bd-ink-muted">
                                <p>{t('games.rock_paper_scissors.rockBeatsScissors')}</p>
                                <p>{t('games.rock_paper_scissors.scissorsBeatsPaper')}</p>
                                <p>{t('games.rock_paper_scissors.paperBeatsRock')}</p>
                            </div>
                        </div>

                        <button
                            onClick={() => router.push(`/lobby/${code}`)}
                            className="w-full bd-btn bd-btn-primary rounded-xl px-4 py-3 font-semibold transition justify-center"
                        >
                            {t('lobby.game.back_to_lobby')}
                        </button>
                    </aside>
                </div>
            </div>

            {!isSpectator && lobby.status === 'playing' && (
                <ReactionOverlay lobbyCode={code} />
            )}
        </div>
        </div>
    )
}
