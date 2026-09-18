'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import SketchAndGuessGameBoard from '@/components/SketchAndGuessGameBoard'
import { SketchAndGuessGameData } from '@/lib/games/sketch-and-guess-game'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse, type LobbySnapshotLike } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackLobbyLeaveRedirect, trackMoveSubmitApplied } from '@/lib/analytics'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { getThemePageStyle } from '@/lib/lobby-themes'

type SketchLifecycleStatus = 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled'

interface SketchAndGuessGame {
    id: string
    lobbyCode: string
    gameType: string
    status: SketchLifecycleStatus
    players: Array<{ id: string; name: string }>
    data: SketchAndGuessGameData
}

interface LobbyData {
    id: string
    code: string
    status: SketchLifecycleStatus
    isActive?: boolean
    creatorId?: string
    gameId?: string
    gameType?: string
    game?: SketchAndGuessGame
    theme?: string
}

interface SketchAndGuessLobbyPageProps {
    code: string
    isSpectator?: boolean
    onGameReset?: () => void
}

const LEAVE_REDIRECT_FALLBACK_MS = 1500
const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600

function defaultSketchState(): SketchAndGuessGameData {
    return {
        phase: 'drawing',
        currentRound: 1,
        totalRounds: 3,
        drawerOrder: [],
        currentDrawerId: '',
        rounds: [],
        submittedPlayerIds: [],
        scores: {},
        scoreBreakdown: {},
        winnerId: null,
        ranking: [],
        completionReason: null,
        finishedAt: null,
        isMvpScaffold: true,
    }
}

function parseSketchState(state: unknown): SketchAndGuessGameData {
    const fallback = defaultSketchState()
    if (!state) return fallback

    let parsed: unknown = state
    if (typeof state === 'string') {
        try {
            parsed = JSON.parse(state)
        } catch {
            return fallback
        }
    }

    const data = (parsed as Record<string, unknown>)?.data
    if (!data || typeof data !== 'object') return fallback

    const d = data as Record<string, unknown>
    return {
        phase: d.phase === 'guessing' || d.phase === 'reveal' ? d.phase : 'drawing',
        currentRound: typeof d.currentRound === 'number' ? d.currentRound : fallback.currentRound,
        totalRounds: typeof d.totalRounds === 'number' ? d.totalRounds : fallback.totalRounds,
        drawerOrder: Array.isArray(d.drawerOrder) ? (d.drawerOrder as string[]) : [],
        currentDrawerId: typeof d.currentDrawerId === 'string' ? d.currentDrawerId : '',
        rounds: Array.isArray(d.rounds) ? (d.rounds as SketchAndGuessGameData['rounds']) : [],
        submittedPlayerIds: Array.isArray(d.submittedPlayerIds) ? (d.submittedPlayerIds as string[]) : [],
        scores: typeof d.scores === 'object' && d.scores ? (d.scores as Record<string, number>) : {},
        scoreBreakdown:
            typeof d.scoreBreakdown === 'object' && d.scoreBreakdown
                ? (d.scoreBreakdown as SketchAndGuessGameData['scoreBreakdown'])
                : {},
        winnerId: typeof d.winnerId === 'string' ? d.winnerId : null,
        ranking: Array.isArray(d.ranking) ? (d.ranking as string[]) : [],
        completionReason: d.completionReason === 'all-rounds-finished' ? 'all-rounds-finished' : null,
        finishedAt: typeof d.finishedAt === 'number' ? d.finishedAt : null,
        isMvpScaffold: d.isMvpScaffold !== false,
    }
}

export default function SketchAndGuessLobbyPage({ code, isSpectator = false, onGameReset }: SketchAndGuessLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<LobbyData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isReturningToWaiting, setIsReturningToWaiting] = useState(false)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)

    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(
        code,
        'Sketch & Guess'
    )
    // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
    useLobbyHeartbeat(code, !isSpectator)
    const lifecycleRedirectInFlightRef = useRef(false)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'sketch_and_guess').minPlayersRequired

    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    useEffect(() => {
        void router.prefetch('/games')
    }, [router])

    const trackLeaveRedirectEvent = useCallback(
        (navigation: 'router_replace' | 'window_assign_fallback') => {
            const leaveStartedAt = leaveStartedAtRef.current
            if (leaveStartedAt === null) return
            trackLobbyLeaveRedirect({
                durationMs: Date.now() - leaveStartedAt,
                isGuest,
                source: 'sketch_and_guess_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'sketch_and_guess',
            })
        },
        [isGuest, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveStartedAtRef]
    )

    const navigateAfterLeave = useCallback(() => {
        router.replace('/games')
        trackLeaveRedirectEvent('router_replace')
        if (typeof window === 'undefined') return
        window.setTimeout(() => {
            if (window.location.pathname.startsWith(`/lobby/${code}`)) {
                trackLeaveRedirectEvent('window_assign_fallback')
                window.location.assign('/games')
            }
        }, LEAVE_REDIRECT_FALLBACK_MS)
    }, [router, code, trackLeaveRedirectEvent])

    const triggerLifecycleRedirect = useCallback(
        (reason: string) => {
            if (isLeavingLobbyRef.current || lifecycleRedirectInFlightRef.current) return
            lifecycleRedirectInFlightRef.current = true
            showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'sketch-lifecycle-redirect' })
            clientLogger.warn('Sketch & Guess lifecycle redirect triggered', { code, reason, target: '/games' })
            router.replace('/games')
            if (typeof window !== 'undefined') {
                window.setTimeout(() => {
                    if (window.location.pathname.startsWith(`/lobby/${code}`)) window.location.assign('/games')
                }, LIFECYCLE_REDIRECT_FALLBACK_MS)
            }
        },
        [router, code, isLeavingLobbyRef]
    )

    const normalizeLobbyResponse = useCallback((payload: LobbySnapshotLike | null | undefined): LobbyData | null => {
        const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(payload, { includeFinished: true })

        if (!lobbyPayload?.id || !lobbyPayload?.code) return null

        if (!activeGame) {
            return {
                id: lobbyPayload.id,
                code: lobbyPayload.code,
                status: 'waiting',
                isActive: lobbyPayload.isActive,
                creatorId: lobbyPayload.creatorId,
                gameType: lobbyPayload.gameType,
                theme: lobbyPayload.theme,
            }
        }

        const players = Array.isArray(activeGame.players)
            ? activeGame.players.map((player: Record<string, unknown>) => ({
                  id: String(player?.userId || player?.id || ''),
                  name: String((player?.user as Record<string, unknown>)?.username || player?.name || 'Unknown'),
              }))
            : []

        const normalizedStatus: SketchLifecycleStatus =
            activeGame.status === 'waiting' ||
            activeGame.status === 'playing' ||
            activeGame.status === 'finished' ||
            activeGame.status === 'abandoned' ||
            activeGame.status === 'cancelled'
                ? activeGame.status
                : 'waiting'

        const normalizedGame: SketchAndGuessGame = {
            id: activeGame.id,
            lobbyCode: lobbyPayload.code,
            gameType: activeGame.gameType || lobbyPayload.gameType || 'sketch_and_guess',
            status: normalizedStatus,
            players,
            data: parseSketchState(activeGame.state),
        }

        return {
            id: lobbyPayload.id,
            code: lobbyPayload.code,
            status: normalizedGame.status,
            isActive: lobbyPayload.isActive,
            creatorId: lobbyPayload.creatorId,
            gameId: normalizedGame.id,
            gameType: lobbyPayload.gameType,
            game: normalizedGame,
            theme: lobbyPayload.theme,
        }
    }, [])

    const loadLobbyData = useCallback(async () => {
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!res.ok) throw new Error('Failed to load lobby')
            const data = await res.json()
            const normalizedLobby = normalizeLobbyResponse(data)
            if (!normalizedLobby) throw new Error('Invalid lobby response')
            setLobby(normalizedLobby)
            finalizePendingLobbyCreateMetric({ lobbyCode: normalizedLobby.code, fallbackGameType: normalizedLobby.gameType })
        } catch (err) {
            clientLogger.error('Failed to load lobby:', err)
            setError(t('errors.failedToLoad'))
        } finally {
            setLoading(false)
        }
    }, [code, t, normalizeLobbyResponse])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({ gameStatus: lobby?.status, lobbyIsActive: lobby?.isActive })
        if (redirectReason) triggerLifecycleRedirect(redirectReason)
    }, [lobby?.status, lobby?.isActive, triggerLifecycleRedirect])

    const handleGameAbandoned = useCallback(
        (data: { gameId: string; reason?: string }) => {
            clientLogger.log('📡 Sketch & Guess game abandoned:', data)
            if (isLeavingLobbyRef.current) return
            void loadLobbyData()
            triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
        },
        [loadLobbyData, triggerLifecycleRedirect, isLeavingLobbyRef]
    )

    const handlePlayerLeft = useCallback(
        (data: {
            userId: string
            username?: string
            playerName?: string
            remainingPlayers?: number
            gameTerminal?: boolean
        }) => {
            clientLogger.log('📡 Sketch & Guess player left:', data)
            if (isLeavingLobbyRef.current) return

            const departedPlayerName = data.username || data.playerName
            if (departedPlayerName) showToast.info('toast.playerLeft', undefined, { player: departedPlayerName })

            if (!data.gameTerminal && typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
                triggerLifecycleRedirect('player-left:insufficient-players')
                return
            }
            void loadLobbyData()
        },
        [loadLobbyData, minPlayersRequired, triggerLifecycleRedirect, isLeavingLobbyRef]
    )

    useEffect(() => {
        if (status === 'loading' || (status === 'unauthenticated' && !isGuest && !isSpectator)) return
        if (isGuest && !guestToken) return
        void loadLobbyData()
    }, [status, isGuest, guestToken, isSpectator, loadLobbyData])

    const handleGameUpdate = useCallback(async (_payload: unknown) => {
        await loadLobbyData()
        clientLogger.log('📡 Sketch & Guess: Received game update')
    }, [loadLobbyData])

    const handleLobbyUpdate = useCallback(async (_data: unknown) => {
        await loadLobbyData()
        clientLogger.log('📡 Sketch & Guess: Received lobby update')
    }, [loadLobbyData])

    const handleGameReset = useCallback(() => {
        if (onGameReset) onGameReset()
        else router.push(`/lobby/${code}`)
    }, [code, onGameReset, router])

    const { isConnected: socketConnected } = useRealtimeConnection({
        // #987: Supabase Broadcast has no replay buffer, so every event that
        // landed while the socket was down is gone. Without this the board
        // stayed frozen on pre-gap state and neither player could move.
        onStateSync: async () => { await loadLobbyData() },
        code,
        shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken) || isSpectator),
        onGameUpdate: handleGameUpdate,
        onLobbyUpdate: handleLobbyUpdate,
        onGameAbandoned: handleGameAbandoned,
        onPlayerLeft: handlePlayerLeft,
        onGameReset: handleGameReset,
    })

    const submitAction = useCallback(
        async (action: 'submit-drawing' | 'submit-guess' | 'advance-round', data: Record<string, unknown>) => {
            if (!lobby?.game) return

            const submitStartedAt = Date.now()
            let responseStatus: number | undefined
            setIsSubmitting(true)
            setError(null)
            try {
                const sendAction = () => fetchWithGuest(`/api/game/${lobby.game!.id}/sketch-and-guess-action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, data }),
                })

                let res = await sendAction()
                responseStatus = res.status
                let payload = await res.json().catch(() => null)

                // Everyone guesses into the same phase at once, and the server
                // writes under an optimistic lock on the game row, so the one
                // who loses the race is told nothing was written. Sending again
                // is the recovery: the route re-reads state every time (#993).
                for (let attempt = 1; attempt < 3 && res.status === 409 && payload?.code === 'STATE_CONFLICT'; attempt += 1) {
                    await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
                    res = await sendAction()
                    responseStatus = res.status
                    payload = await res.json().catch(() => null)
                }

                if (!res.ok) {
                    trackMoveSubmitApplied({
                        gameType: 'sketch_and_guess',
                        moveType: action,
                        durationMs: Date.now() - submitStartedAt,
                        isGuest,
                        success: false,
                        applied: false,
                        statusCode: responseStatus,
                        source: 'sketch_and_guess_page',
                    })
                    if (payload?.code === 'ROUND_TIMEOUT_ADVANCED') {
                        await loadLobbyData()
                        showToast.info('games.guess_my_drawing.game.roundAdvancedByTimeout')
                        return
                    }
                    throw new Error(payload?.error || 'Failed to submit action')
                }

                const authoritativeState = payload?.state
                if (authoritativeState) {
                    const normalizedData = parseSketchState(authoritativeState)
                    setLobby((prevLobby) => {
                        if (!prevLobby?.game) return prevLobby
                        const responsePlayers = Array.isArray(authoritativeState?.players)
                            ? (authoritativeState.players as Array<Record<string, unknown>>)
                                  .map((player) => ({
                                      id: typeof player?.id === 'string' ? player.id : '',
                                      name: prevLobby.game!.players.find((p) => p.id === player.id)?.name || 'Unknown',
                                  }))
                                  .filter((player) => player.id.length > 0)
                            : prevLobby.game.players
                        return {
                            ...prevLobby,
                            status: authoritativeState?.status ?? prevLobby.status,
                            game: {
                                ...prevLobby.game,
                                status: authoritativeState?.status ?? prevLobby.game.status,
                                players: responsePlayers,
                                data: normalizedData,
                            },
                        }
                    })
                } else {
                    void loadLobbyData()
                }

                trackMoveSubmitApplied({
                    gameType: 'sketch_and_guess',
                    moveType: action,
                    durationMs: Date.now() - submitStartedAt,
                    isGuest,
                    success: true,
                    applied: true,
                    statusCode: responseStatus,
                    source: 'sketch_and_guess_page',
                })
                showToast.success('lobby.game.move_submitted')
            } catch (err) {
                clientLogger.error(`Failed to submit ${action}:`, err)
                const errorMessage = err instanceof Error ? err.message : t('errors.generic')
                setError(errorMessage)
                showToast.error('errors.general', undefined, { message: errorMessage })
            } finally {
                setIsSubmitting(false)
            }
        },
        [lobby, isGuest, t, loadLobbyData]
    )

    const handleSubmitDrawing = useCallback((content: string) => submitAction('submit-drawing', { content }), [submitAction])
    const handleSubmitGuess = useCallback((guess: string) => submitAction('submit-guess', { guess }), [submitAction])
    const handleAdvanceRound = useCallback(() => submitAction('advance-round', {}), [submitAction])

    const handleLeave = () => {
        if (isLeavingLobbyRef.current) return
        setShowLeaveConfirmModal(false)
        leaveLobby()
        navigateAfterLeave()
    }

    const handleReturnToWaiting = useCallback(async () => {
        const userId = getCurrentUserId()
        if (!userId || !lobby || lobby.creatorId !== userId) return
        setIsReturningToWaiting(true)
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}/return-to-waiting`, { method: 'POST' })
            if (!res.ok) throw new Error('Failed to return to waiting room')
            handleGameReset()
        } catch (err) {
            clientLogger.error('Failed to return to waiting room:', err)
            showToast.errorFrom(err, 'errors.generic')
        } finally {
            setIsReturningToWaiting(false)
        }
    }, [code, getCurrentUserId, lobby, handleGameReset])

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
    const gameData = lobby.game.data

    if (!currentPlayer && !isSpectator) {
        return (
            <div className="min-h-[100dvh] bg-gradient-to-b from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
                <div className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-6 shadow-sm max-w-md text-center">
                    <p className="text-bd-ink-soft mb-4">{t('lobby.game.notPartOfMatch')}</p>
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

    const isCreator = !isSpectator && !!currentUserId && lobby.creatorId === currentUserId
    const isFinished = lobby.game.status === 'finished'

    return (
        <div className="h-[var(--game-h)] overflow-y-auto" style={getThemePageStyle(lobby?.theme)}>
            <div className="px-4 py-5 sm:px-6 sm:py-8 min-h-full">
                <div className="mx-auto max-w-5xl space-y-5">
                    <header className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-4 shadow-sm sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-2xl font-extrabold text-bd-ink sm:text-3xl">
                                    <Icon name="palette" size={16} /> {t('games.guess_my_drawing.name')}
                                </h1>
                                <p className="mt-1 text-sm text-bd-ink-muted">
                                    {t('lobby.game.code')}: <span className="font-mono font-semibold">{code.toUpperCase()}</span>
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                        socketConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    }`}
                                >
                                    <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    {socketConnected ? t('games.guess_my_drawing.game.liveUpdates') : t('games.guess_my_drawing.game.reconnecting')}
                                </span>
                                <span className="inline-flex items-center rounded-full bd-chip px-3 py-1 text-xs font-semibold">
                                    {lobby.game.players.length} {t('game.ui.player')}
                                </span>
                                {!isSpectator && (
                                    <button
                                        onClick={() => setShowLeaveConfirmModal(true)}
                                        className="rounded-full px-3 py-1 text-xs font-semibold"
                                        style={{ background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-coral-deep)' }}
                                    >
                                        {t('game.ui.leave')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </header>

                    <section className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-4 shadow-sm sm:p-5">
                        <SketchAndGuessGameBoard
                            gameData={gameData}
                            gameStatus={lobby.game.status}
                            playerId={isSpectator ? '' : currentPlayer!.id}
                            players={lobby.game.players}
                            onSubmitDrawing={handleSubmitDrawing}
                            onSubmitGuess={handleSubmitGuess}
                            onAdvanceRound={handleAdvanceRound}
                            isSubmitting={isSubmitting}
                            isSpectator={isSpectator}
                        />
                    </section>

                    {isFinished && (
                        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                            {isCreator ? (
                                <button
                                    onClick={handleReturnToWaiting}
                                    disabled={isReturningToWaiting}
                                    className="w-full sm:w-auto bd-btn bd-btn-primary rounded-xl px-6 py-3 font-semibold transition disabled:opacity-60"
                                >
                                    {t('lobby.game.back_to_lobby')}
                                </button>
                            ) : (
                                <p className="text-sm text-bd-ink-muted">{t('game.ui.waitingForHost')}</p>
                            )}
                        </div>
                    )}
                </div>

                {!isSpectator && lobby.status === 'playing' && <ReactionOverlay lobbyCode={code} />}
            </div>

            <ConfirmModal
                isOpen={showLeaveConfirmModal}
                onClose={() => setShowLeaveConfirmModal(false)}
                onConfirm={handleLeave}
                title={t('game.ui.leave')}
                message={t('game.ui.leaveConfirm')}
                confirmText={t('game.ui.leave')}
                variant="danger"
            />
        </div>
    )
}
