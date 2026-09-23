'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import LeaveIcon from '@/components/LeaveIcon'
import ConfirmModal from '@/components/ConfirmModal'
import Chat from '@/components/Chat'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
import GameLeaveButton from '@/components/game-chrome/GameLeaveButton'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'
import SketchAndGuessGameBoard, {
    SketchScoreRows,
    emptySketchAndGuessDraft,
    serializeSketchDrawing,
    type SketchAndGuessDraft,
    type SketchGuessResult,
    type SketchLiveView,
} from '@/components/SketchAndGuessGameBoard'
import type { SketchAndGuessGameData } from '@/lib/games/sketch-and-guess-game'
import { sketchWordDisplay } from '@/lib/games/sketch-and-guess-word-display'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import { useGameTimer } from '@/app/lobby/[code]/hooks/useGameTimer'
import { useLobbyChat, useLobbyChatHistory } from '@/app/lobby/[code]/hooks/useLobbyChat'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse, type LobbySnapshotLike } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackLobbyLeaveRedirect, trackMoveSubmitApplied } from '@/lib/analytics'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { LobbyPageErrorFallback, LobbyPageLoadingFallback } from '@/app/lobby/[code]/components/LobbyPageFallbacks'
import { isLobbyGoneStatus } from '@/lib/lobby-fetch-status'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'
import { sketchPhaseSeconds } from '@/lib/games/sketch-and-guess-phases'
import {
    SKETCH_LIVE_EVENT,
    SKETCH_LIVE_RESYNC_MS,
    SKETCH_LIVE_THROTTLE_MS,
    parseSketchLiveMessage,
    type Stroke as LiveStroke,
} from '@/lib/sketch-live'

type SketchLifecycleStatus = 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled'

interface SketchPlayer {
    id: string
    name: string
    avatarUrl: string | null
    isPremium: boolean
}

interface SketchAndGuessGame {
    id: string
    lobbyCode: string
    gameType: string
    status: SketchLifecycleStatus
    players: SketchPlayer[]
    data: SketchAndGuessGameData
    /** When the current phase started; the engine stamps it on every phase change (#1022). */
    lastMoveAt?: number
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
const SKETCH_ACCENT = 'var(--bd-mint)'
const SKETCH_ACCENT_DEEP = 'var(--bd-mint-deep)'

/** The engine's three phases, as a number the turn timer can hang a signature off. */
const PHASE_ORDINAL: Record<SketchAndGuessGameData['phase'], number> = { choosing: 0, drawing: 1, reveal: 2 }

type SketchAction = 'choose-word' | 'submit-drawing' | 'submit-guess' | 'accept-guess' | 'advance-round'

/**
 * What a round starts with, and what a page shows for any round the draft below
 * is not holding. One shared frozen instance rather than a fresh object per
 * render, so the canvas is not handed a new `strokes` array every time the
 * lobby snapshot changes.
 */
const EMPTY_DRAFT: SketchAndGuessDraft = Object.freeze(emptySketchAndGuessDraft())

function defaultSketchState(): SketchAndGuessGameData {
    return {
        phase: 'choosing',
        phaseStartedAt: null,
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

/** The phase deadline is measured from `lastMoveAt`, which arrives as a string or an object. */
function readLastMoveAt(raw: unknown): number | undefined {
    let parsed: unknown = raw
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw)
        } catch {
            return undefined
        }
    }
    const value = (parsed as Record<string, unknown>)?.lastMoveAt
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
    const rounds = Array.isArray(d.rounds) ? (d.rounds as SketchAndGuessGameData['rounds']) : []
    // Pre-#1082 `submittedPlayerIds` meant "has answered", right or wrong; now it
    // means "has it". Until the server next writes the game, read it the new way.
    const legacyCorrectIds =
        d.phase === 'guessing'
            ? [...new Set((rounds.find((r) => r.round === d.currentRound)?.guesses ?? []).filter((g) => g.isCorrect).map((g) => g.playerId))]
            : null
    return {
        // A game persisted before #1082 can still say `guessing`; the engine reads
        // it as drawing with guesses in it, and so does the page.
        phase: d.phase === 'choosing' || d.phase === 'reveal' ? d.phase : 'drawing',
        phaseStartedAt: typeof d.phaseStartedAt === 'number' ? d.phaseStartedAt : null,
        currentRound: typeof d.currentRound === 'number' ? d.currentRound : fallback.currentRound,
        totalRounds: typeof d.totalRounds === 'number' ? d.totalRounds : fallback.totalRounds,
        drawerOrder: Array.isArray(d.drawerOrder) ? (d.drawerOrder as string[]) : [],
        currentDrawerId: typeof d.currentDrawerId === 'string' ? d.currentDrawerId : '',
        rounds,
        submittedPlayerIds: legacyCorrectIds ?? (Array.isArray(d.submittedPlayerIds) ? (d.submittedPlayerIds as string[]) : []),
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
    const { t, i18n } = useTranslation()
    const locale = i18n?.language || 'en'

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<LobbyData | null>(null)
    const stuckPhaseRecoveryRef = useRef(createStuckTurnRecovery())
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isReturningToWaiting, setIsReturningToWaiting] = useState(false)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [mobileTab, setMobileTab] = useState<'board' | 'scores' | 'chat'>('board')
    const [overlayInspecting, setOverlayInspecting] = useState(false)

    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(
        code,
        'Sketch & Guess'
    )
    // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
    useLobbyHeartbeat(code, !isSpectator)
    // isSubmitting is state, so an async callback that read it would read the
    // value from the render it closed over - the second Enter gets false and
    // sends anyway. The ref is the guard; the state is only for the spinner
    // (#1006, the same pattern as tic-tac-toe and RPS).
    const submitInFlightRef = useRef(false)

    const lifecycleRedirectInFlightRef = useRef(false)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'sketch_and_guess').minPlayersRequired

    const {
        chatMessages,
        sendChatMessage,
        unreadCount: chatUnreadCount,
        resetUnread: resetChatUnread,
        someoneTyping,
        onChatMessage,
        onPlayerTyping,
        mergeHistoryMessages,
    } = useLobbyChat({ code, isChatVisible: mobileTab === 'chat' })

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

        const players: SketchPlayer[] = Array.isArray(activeGame.players)
            ? activeGame.players.map((player: Record<string, unknown>) => {
                  const user = (player?.user as Record<string, unknown>) || {}
                  return {
                      id: String(player?.userId || player?.id || ''),
                      name: String(user?.username || player?.name || 'Unknown'),
                      avatarUrl: (user?.avatarUrl as string | null) ?? (user?.image as string | null) ?? null,
                      isPremium: !!user?.isPremium,
                  }
              })
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
            lastMoveAt: readLastMoveAt(activeGame.state),
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
            // `locale` is what the server builds the word hint in for a guesser (#1082).
            const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true&locale=${encodeURIComponent(locale)}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })

            const data = await res.json().catch(() => null)
            if (!res.ok) {
                // A gone lobby (404/403/410) has to land the player on the error screen
                // rather than keep a board that can never update again. #991: every other
                // status is a failed fetch — a 429 from a shared IP, a transient 5xx — and
                // used to wipe a live game just the same. Same split as the other pages.
                clientLogger.error('Failed to load lobby:', data?.error)
                showToast.error('errors.failedToLoad', undefined, undefined, { id: 'sketch-load-failed' })
                if (isLobbyGoneStatus(res.status)) setLobby(null)
                return
            }
            const normalizedLobby = normalizeLobbyResponse(data)
            if (!normalizedLobby) throw new Error('Invalid lobby response')
            setLobby(normalizedLobby)
            finalizePendingLobbyCreateMetric({ lobbyCode: normalizedLobby.code, fallbackGameType: normalizedLobby.gameType })
        } catch (err) {
            // A network blip is not a dead lobby, so a game in progress stays on screen. One
            // toast id, because every realtime broadcast calls this and N failures are still one
            // thing gone wrong.
            clientLogger.error('Failed to load lobby:', err)
            showToast.error('errors.failedToLoad', undefined, undefined, { id: 'sketch-load-failed' })
        } finally {
            setLoading(false)
        }
    }, [code, normalizeLobbyResponse, locale])

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
        stuckPhaseRecoveryRef.current.reset()
        setOverlayInspecting(false)
        if (onGameReset) onGameReset()
        else router.push(`/lobby/${code}`)
    }, [code, onGameReset, router])

    // The live-drawing handler depends on the round and the drawer, which are
    // derived further down; the hook is called before them, so it reaches the
    // current handler through a ref.
    const sketchLiveHandlerRef = useRef<(payload: unknown) => void>(() => {})
    const handleSketchLive = useCallback((payload: unknown) => sketchLiveHandlerRef.current(payload), [])

    const { isConnected: socketConnected, isReconnecting, emitWhenConnected } = useRealtimeConnection({
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
        onChatMessage,
        onPlayerTyping,
        onSketchLive: handleSketchLive,
    })

    useLobbyChatHistory({ code, isConnected: socketConnected, isReconnecting, mergeHistoryMessages })

    const submitAction = useCallback(
        async (
            action: SketchAction,
            data: Record<string, unknown>,
            options: { silent?: boolean } = {}
        ): Promise<Record<string, unknown> | null> => {
            if (!lobby?.game) return null
            if (submitInFlightRef.current) return null

            const submitStartedAt = Date.now()
            let responseStatus: number | undefined
            submitInFlightRef.current = true
            setIsSubmitting(true)
            try {
                const sendAction = () => fetchWithGuest(`/api/game/${lobby.game!.id}/sketch-and-guess-action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, data, locale }),
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
                        if (!options.silent) showToast.info('games.guess_my_drawing.game.roundAdvancedByTimeout')
                        return null
                    }
                    // #1082: the server's rate limit on guesses, said in words a player acts on.
                    if (payload?.code === 'GUESS_TOO_FAST') {
                        showToast.info('games.guess_my_drawing.game.guessTooFast', undefined, undefined, { id: 'sketch-guess-too-fast' })
                        return null
                    }
                    if (payload?.code === 'GUESS_LIMIT_REACHED') {
                        showToast.info('games.guess_my_drawing.game.guessLimitReached', undefined, undefined, { id: 'sketch-guess-limit' })
                        return null
                    }
                    if (options.silent) {
                        // The drawing the page sends by itself as the reveal opens: if it
                        // lost a race with the reveal clock, the round has moved on and
                        // there is nothing for the player to do about it.
                        clientLogger.warn(`Sketch & Guess ${action} was not applied`, { status: res.status, error: payload?.error })
                        return null
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
                                  .map((player) => {
                                      const id = typeof player?.id === 'string' ? player.id : ''
                                      const known = prevLobby.game!.players.find((p) => p.id === id)
                                      return {
                                          id,
                                          name: known?.name || 'Unknown',
                                          avatarUrl: known?.avatarUrl ?? null,
                                          isPremium: known?.isPremium ?? false,
                                      }
                                  })
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
                                lastMoveAt: readLastMoveAt(authoritativeState) ?? prevLobby.game.lastMoveAt,
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
                // A guess is one of dozens in a round and the feed already shows it
                // landing; a toast per guess would bury the board.
                if (!options.silent && action !== 'submit-guess' && action !== 'choose-word') {
                    showToast.success('lobby.game.move_submitted')
                }
                return payload as Record<string, unknown> | null
            } catch (err) {
                clientLogger.error(`Failed to submit ${action}:`, err)
                const errorMessage = err instanceof Error ? err.message : t('errors.generic')
                // A rejected guess or drawing is a toast, never a page-level error screen: the
                // round is still live and the player has to stay on the board to try again.
                if (!options.silent) showToast.error('errors.general', undefined, { message: errorMessage })
                return null
            } finally {
                submitInFlightRef.current = false
                setIsSubmitting(false)
            }
        },
        [lobby, isGuest, t, loadLobbyData, locale]
    )

    const handleSubmitGuess = useCallback(async (guess: string): Promise<SketchGuessResult | void> => {
        const payload = await submitAction('submit-guess', { guess })
        const result = payload?.guessResult as SketchGuessResult | undefined
        return result && typeof result.close === 'boolean' ? result : undefined
    }, [submitAction])
    const handleAdvanceRound = useCallback(async () => { await submitAction('advance-round', {}) }, [submitAction])
    const handleChooseWord = useCallback(async (wordId: string) => { await submitAction('choose-word', { wordId }) }, [submitAction])
    const handleAcceptGuess = useCallback(async (guessId: string) => { await submitAction('accept-guess', { guessId }) }, [submitAction])

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

    /**
     * #1032: the finished screen used to offer the host a single "back to lobby"
     * link and everyone else nothing at all, which is a dead end at the one
     * moment a group is most likely to want another round. Same rematch call the
     * waiting room and Rock Paper Scissors make.
     */
    const handlePlayAgain = useCallback(async () => {
        const userId = getCurrentUserId()
        if (!lobby || !userId) { router.push(`/lobby/${code}`); return }
        if (lobby.creatorId !== userId) { showToast.info('game.ui.waitingForHost'); return }
        setIsReturningToWaiting(true)
        try {
            const res = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameType: 'sketch_and_guess',
                    lobbyId: lobby.id,
                    config: { maxPlayers: 10, minPlayers: minPlayersRequired },
                }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error((typeof data?.error === 'string' && data.error) || 'Failed to start rematch')
            stuckPhaseRecoveryRef.current.reset()
            setOverlayInspecting(false)
            await loadLobbyData()
            showToast.success('lobby.game.playAgain')
        } catch (err) {
            clientLogger.error('Failed to start Sketch & Guess rematch:', err)
            showToast.errorFrom(err, 'errors.generic')
        } finally {
            setIsReturningToWaiting(false)
        }
    }, [code, getCurrentUserId, loadLobbyData, lobby, minPlayersRequired, router])

    // ─── Derived play state ──────────────────────────────────────────────────
    // Read before the early returns so the hooks below always run in the same
    // order; `game` is null on the fallback screens and every value falls back.

    const game = lobby?.game
    const gameData = game?.data ?? defaultSketchState()
    const currentUserId = getCurrentUserId()
    const isFinished = game?.status === 'finished'
    const phase = gameData.phase
    const phaseSeconds = sketchPhaseSeconds(phase)
    const isDrawer = !isSpectator && !!currentUserId && currentUserId === gameData.currentDrawerId
    const currentRound = gameData.rounds.find((r) => r.round === gameData.currentRound) || null
    // "Has it", not "has typed something": since #1082 a guesser keeps guessing
    // until they are right, so only a correct guess takes them out of the round.
    const hasGuessed = !!currentUserId && gameData.submittedPlayerIds.includes(currentUserId)
    const iOweAMove =
        !isFinished &&
        !isSpectator &&
        (phase === 'choosing' ? isDrawer : phase === 'drawing' ? isDrawer || !hasGuessed : false)
    // The phase clock. Every guess is a move and moves `lastMoveAt`, so the engine
    // keeps the phase's own start in `phaseStartedAt` (#1082); a game saved before
    // that has only `lastMoveAt`, which was the phase start then.
    const phaseStartedAt = gameData.phaseStartedAt ?? game?.lastMoveAt

    // The strokes on the canvas and the half-typed guess belong to the round,
    // not to a layout tree: the desktop, landscape and portrait trees each mount
    // their own board, and only one of them is on screen at a time. Held here,
    // a rotation or a window drag across the breakpoint re-renders the drawing
    // in the tree that takes over instead of handing the drawer a blank canvas
    // with the phase clock still running (#1034). Tagged with the round it was
    // made in, so the next round starts clean without an effect that would clear
    // it one render late.
    const [draftForRound, setDraftForRound] = useState<{ round: number; draft: SketchAndGuessDraft }>(
        () => ({ round: 0, draft: EMPTY_DRAFT })
    )
    const roundNumber = gameData.currentRound
    const activeDraft = draftForRound.round === roundNumber ? draftForRound.draft : EMPTY_DRAFT
    const handleDraftChange = useCallback(
        (next: SketchAndGuessDraft) => setDraftForRound({ round: roundNumber, draft: next }),
        [roundNumber]
    )

    // Live drawing. The drawing phase used to show everyone but the drawer a
    // blank square until the drawing was submitted; now the drawer's canvas is
    // streamed over the lobby channel as it is drawn (lib/sketch-live.ts).
    const drawerIdForLive = gameData.currentDrawerId
    const isStreamingDrawer = isDrawer && phase === 'drawing' && !isFinished
    const [liveView, setLiveView] = useState<SketchLiveView | null>(null)

    sketchLiveHandlerRef.current = (payload: unknown) => {
        if (isDrawer || phase !== 'drawing') return
        const message = parseSketchLiveMessage(payload, { round: roundNumber, drawerId: drawerIdForLive })
        if (!message) return
        setLiveView((prev) => {
            const base = prev && prev.round === message.round ? prev : { round: message.round, strokes: [], live: null }
            return message.kind === 'strokes'
                ? { round: message.round, strokes: message.strokes, live: null }
                : { ...base, live: message.live }
        })
    }

    const committedStrokes = activeDraft.strokes
    useEffect(() => {
        if (!isStreamingDrawer) return
        const send = () =>
            emitWhenConnected(SKETCH_LIVE_EVENT, { kind: 'strokes', round: roundNumber, drawerId: drawerIdForLive, strokes: committedStrokes })
        send()
        // Re-sent on a timer so a player who joins or reconnects mid-round
        // catches up; the channel keeps no history to replay.
        const timer = window.setInterval(send, SKETCH_LIVE_RESYNC_MS)
        return () => window.clearInterval(timer)
    }, [isStreamingDrawer, committedStrokes, roundNumber, drawerIdForLive, emitWhenConnected])

    const pendingLiveRef = useRef<LiveStroke | null>(null)
    const liveTimerRef = useRef<number | null>(null)
    const flushLiveStroke = useCallback(() => {
        liveTimerRef.current = null
        const stroke = pendingLiveRef.current
        emitWhenConnected(SKETCH_LIVE_EVENT, {
            kind: 'live',
            round: roundNumber,
            drawerId: drawerIdForLive,
            // The canvas keeps pushing into the same points array; send a copy.
            live: stroke ? { ...stroke, points: stroke.points.slice() } : null,
        })
    }, [emitWhenConnected, roundNumber, drawerIdForLive])
    const handleLiveStroke = useCallback(
        (stroke: LiveStroke | null) => {
            if (!isStreamingDrawer) return
            pendingLiveRef.current = stroke
            // The end of a stroke goes out with the finished strokes; nothing to throttle.
            if (stroke === null) {
                if (liveTimerRef.current !== null) window.clearTimeout(liveTimerRef.current)
                liveTimerRef.current = null
                return
            }
            if (liveTimerRef.current === null) {
                liveTimerRef.current = window.setTimeout(flushLiveStroke, SKETCH_LIVE_THROTTLE_MS)
            }
        },
        [isStreamingDrawer, flushLiveStroke]
    )
    useEffect(() => () => {
        if (liveTimerRef.current !== null) window.clearTimeout(liveTimerRef.current)
    }, [])

    // The drawing that is kept for the reveal. There is no submit button since
    // #1082 – the round ends on the clock or when the last guesser has it – so
    // the drawer's page sends the canvas the moment it sees the reveal, once per
    // round. Everyone else is already looking at the streamed copy meanwhile,
    // and "Next round" waits for this to land. A blank canvas is sent too: the
    // engine scores it as the empty drawing it is, and nobody waits the full
    // reveal clock for a drawing that is never coming.
    //
    // It has its own sender rather than submitAction, for two reasons found by
    // playing it. submitAction drops a call while another is in flight, and the
    // move that opens the reveal is often the drawer's own (the host accepting
    // the last guess). And a single 429 or lost write-lock race lost the drawing
    // outright, so the drawer paid the blank-drawing penalty for a picture
    // everyone had watched being drawn. So: retried, briefly, on anything that
    // might succeed a moment later.
    const drawingSentForRoundRef = useRef<number | null>(null)
    const needsDrawingSent =
        isDrawer && !isFinished && phase === 'reveal' && !!currentRound && currentRound.drawingContent === null
    const strokesForReveal = activeDraft.strokes
    const gameIdForDrawing = game?.id
    const sendRevealDrawing = useCallback(async (content: string) => {
        if (!gameIdForDrawing) return
        for (let attempt = 0; attempt < 4; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)))
            try {
                const res = await fetchWithGuest(`/api/game/${gameIdForDrawing}/sketch-and-guess-action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'submit-drawing', data: { content }, locale }),
                })
                if (res.ok) {
                    void loadLobbyData()
                    return
                }
                const payload = await res.json().catch(() => null)
                const retryable = res.status === 429 || res.status >= 500 || payload?.code === 'STATE_CONFLICT'
                if (!retryable) return
            } catch {
                // A network blip: try again.
            }
        }
        clientLogger.warn('Sketch & Guess drawing was not stored for the reveal', { gameId: gameIdForDrawing })
    }, [gameIdForDrawing, locale, loadLobbyData])
    useEffect(() => {
        if (!needsDrawingSent || drawingSentForRoundRef.current === roundNumber) return
        drawingSentForRoundRef.current = roundNumber
        void sendRevealDrawing(serializeSketchDrawing(strokesForReveal))
    }, [needsDrawingSent, roundNumber, strokesForReveal, sendRevealDrawing])

    // The word hint uncovers a letter at half and at three quarters of the drawing
    // clock, and the server only builds it when asked, so a guesser's page asks
    // at those two moments rather than waiting for somebody else to move (#1082).
    const hintClockStart = phase === 'drawing' && !isDrawer && !isFinished ? currentRound?.drawingStartedAt ?? phaseStartedAt ?? null : null
    useEffect(() => {
        if (typeof hintClockStart !== 'number') return
        const drawingMs = sketchPhaseSeconds('drawing') * 1000
        const timers = [0.5, 0.75]
            .map((share) => hintClockStart + share * drawingMs + 300 - Date.now())
            .filter((delay) => delay > 0)
            .map((delay) => window.setTimeout(() => { void loadLobbyData() }, delay))
        return () => timers.forEach((timer) => window.clearTimeout(timer))
    }, [hintClockStart, loadLobbyData])

    const timerState = useMemo(() => {
        if (!game) return null
        return {
            currentPlayerIndex: gameData.currentRound * 10 + PHASE_ORDINAL[phase],
            lastMoveAt: phaseStartedAt,
            status: game.status,
        }
    }, [game, gameData.currentRound, phase, phaseStartedAt])

    const { timeLeft } = useGameTimer({
        isMyTurn: iOweAMove,
        gameState: timerState,
        turnTimerLimit: phaseSeconds,
        onTimeout: async (): Promise<boolean> => {
            // #1022: this game's timeout is enforced server-side, inside
            // GET /api/lobby/[code]. During play the page only fetches when a
            // broadcast arrives, and a broadcast needs somebody still moving –
            // let the drawer close their tab and nothing asks, so the phase
            // clock runs out, `applyTimeoutFallback` never runs, and the round
            // sits there until a player reloads. So when the phase is overdue,
            // ask. Throttled by the recovery every other game uses (#989): one
            // request per ten seconds, six at most, then it stops rather than
            // hammering a dead round.
            const decision = stuckPhaseRecoveryRef.current.decide(
                turnSignatureOf(timerState?.currentPlayerIndex, phaseStartedAt),
                Date.now()
            )
            if (decision === 'give-up') return true
            if (decision === 'resync') {
                clientLogger.warn('⏰ Sketch & Guess phase overdue, asking the server', { code, phase })
                await loadLobbyData()
            }
            return false
        },
    })

    if (loading) return <LobbyPageLoadingFallback />
    if (!lobby) return <LobbyPageErrorFallback />

    const themeStyle = getThemePageStyle(lobby.theme)

    if (!game) {
        return (
            <div className="bd-page flex h-[var(--game-h)] items-center justify-center px-4" style={themeStyle}>
                <div className="bd-card w-full max-w-md p-8 text-center">
                    <h1 className="mb-3 text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                        {t('games.tictactoe.game.gameNotStartedTitle')}
                    </h1>
                    <p className="mb-6 text-sm text-bd-ink-soft">{t('games.tictactoe.game.gameNotStartedDescription')}</p>
                    <button onClick={() => router.push(`/lobby/${code}`)} className="bd-btn bd-btn-primary mx-auto">
                        {t('game.ui.backToLobby')}
                    </button>
                </div>
            </div>
        )
    }

    const players = game.players
    const currentPlayer = players.find((p) => p.id === currentUserId)

    if (!currentPlayer && !isSpectator) {
        return (
            <div className="bd-page flex h-[var(--game-h)] items-center justify-center px-4" style={themeStyle}>
                <div className="bd-card w-full max-w-md p-8 text-center">
                    <p className="mb-6 text-sm text-bd-ink-soft">{t('lobby.game.notPartOfMatch')}</p>
                    {/* Same key as the card above and as rock-paper-scissors: `lobby.game.back_to_lobby`
                        is worded differently in no and uk, so two adjacent screens read as two actions. */}
                    <button onClick={() => router.push(`/lobby/${code}`)} className="bd-btn bd-btn-primary mx-auto">
                        {t('game.ui.backToLobby')}
                    </button>
                </div>
            </div>
        )
    }

    const isCreator = !isSpectator && !!currentUserId && lobby.creatorId === currentUserId
    const playerById = new Map(players.map((p) => [p.id, p]))
    const scores = gameData.scores
    const drawerId = gameData.currentDrawerId
    const nameOf = (id: string) => playerById.get(id)?.name || t('game.ui.playerFallback')

    // The scoreboard row seats two of up to ten, so it shows the two that
    // matter to this viewer: whoever is drawing, and the viewer. A drawer (or a
    // spectator, who is nobody) gets the leading opponent in the other seat, so
    // the row never shows the same person twice and never shows an empty card.
    const contenders = players.filter((p) => p.id !== drawerId).sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
    const meSeatId = !isSpectator && currentUserId && currentUserId !== drawerId ? currentUserId : contenders[0]?.id || ''
    // Who has it. `submittedPlayerIds` is the public record of correct guessers
    // (#1082); the guesses themselves are all in the feed, but a correct one's
    // text is blanked for everyone else, so the id list is what is counted.
    const guessedIds = new Set(gameData.submittedPlayerIds)
    const winnerId = gameData.winnerId
    const iWon = !!winnerId && winnerId === currentUserId
    const totalGuessers = Math.max(0, players.length - 1)
    const submittedCount = gameData.submittedPlayerIds.length

    const phaseLabel =
        phase === 'choosing'
            ? t('games.guess_my_drawing.game.phaseChoosing')
            : phase === 'drawing'
              ? t('games.guess_my_drawing.game.phaseDrawing')
              : t('games.guess_my_drawing.game.phaseReveal')

    // The word in the viewer's own language. Before the reveal only the drawer's
    // state carries it; a round saved before #1082 has only its English prompt.
    const revealedWord = currentRound
        ? sketchWordDisplay(currentRound.word ?? (currentRound.prompt ? { en: [currentRound.prompt] } : null), locale)
        : ''

    const finishedMessage = iWon
        ? t('games.guess_my_drawing.game.youWin')
        : t('games.guess_my_drawing.game.winnerBanner', { name: winnerId ? nameOf(winnerId) : t('game.ui.playerFallback') })

    const activeTitle = isFinished
        ? finishedMessage
        : phase === 'reveal'
          ? t('games.guess_my_drawing.game.revealHeading', { prompt: revealedWord })
          : phase === 'choosing'
            ? isDrawer
                ? t('games.guess_my_drawing.game.chooseWordTitle')
                : t('games.guess_my_drawing.game.choosingWait', { name: nameOf(drawerId) })
            : isDrawer
              ? t('games.guess_my_drawing.game.drawerIntro')
              : isSpectator
                // A spectator has no seat, so "guess now" would be an instruction
                // they cannot follow (#1033/#1034).
                ? t('games.guess_my_drawing.game.spectatorGuessing')
                : hasGuessed
                  ? t('games.guess_my_drawing.game.alreadyGuessed')
                  : t('games.guess_my_drawing.game.guessNow')

    const pencilBadge = (
        <div style={{
            position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 7,
            background: SKETCH_ACCENT, color: '#fff', border: '2px solid var(--bd-ink)',
            display: 'grid', placeItems: 'center',
        }}>
            <Icon name="pencil" size={12} tone="on-accent" />
        </div>
    )

    const seatCard = (id: string, side: 'left' | 'right', isActive: boolean, cornerBadge?: React.ReactNode) => (
        <GamePlayerCard
            name={id ? nameOf(id) : '–'}
            isActive={isActive}
            isMe={!!currentUserId && id === currentUserId}
            isWinner={isFinished && !!id && winnerId === id}
            side={side}
            avatarSrc={id ? playerById.get(id)?.avatarUrl ?? null : null}
            isPremium={id ? !!playerById.get(id)?.isPremium : false}
            accentColor={side === 'left' ? SKETCH_ACCENT : 'var(--bd-lav)'}
            turnDotColor={SKETCH_ACCENT_DEEP}
            subline={t('games.guess_my_drawing.game.points', { count: id ? scores[id] || 0 : 0 })}
            cornerBadge={cornerBadge}
        />
    )

    const headerSection = (
        <div className="ttt-card sketch-header-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(93,211,158,0.12) 100%)', overflow: 'hidden', padding: '12px 16px' }}>
            <div style={{ position: 'absolute', right: -10, top: -14, opacity: 0.12, transform: 'rotate(12deg)', pointerEvents: 'none', lineHeight: 1 }}>
                <Icon name="palette" size={96} />
            </div>
            <GameScoreboardHeader
                leftCard={seatCard(drawerId, 'left', !isFinished && phase !== 'reveal', pencilBadge)}
                center={
                    <>
                        <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                            {t('game.ui.round')}
                        </div>
                        <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                            {gameData.currentRound}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>/</span>{gameData.totalRounds}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                            {phaseLabel}
                        </div>
                    </>
                }
                centerCompact={
                    <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {gameData.currentRound}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>/</span>{gameData.totalRounds}
                    </div>
                }
                rightCard={seatCard(meSeatId, 'right', !isFinished && phase === 'drawing' && !!meSeatId && !guessedIds.has(meSeatId))}
                trailing={
                    isSpectator
                        ? <GameLeaveButton label={t('game.ui.backToLobby')} href={`/lobby/${code}`} variant="back" />
                        : <GameLeaveButton label={t('game.ui.leave')} onClick={() => setShowLeaveConfirmModal(true)} />
                }
            />
        </div>
    )

    const statusSection = (
        <GameStatusBanner
            isFinished={isFinished}
            finishedMessage={finishedMessage}
            activeTitle={activeTitle}
            meta={phase === 'drawing' && !isFinished ? `${submittedCount}/${totalGuessers}` : undefined}
            secs={timeLeft}
            turnTimerLimit={phaseSeconds}
            isYourTurn={iOweAMove}
            barColor={SKETCH_ACCENT}
            leadingIcon={<Icon name="palette" size={20} />}
            isSpectator={isSpectator}
        />
    )

    const renderBoardSection = (testId?: string) => (
        <div className="sketch-board-card" data-testid={testId}>
            <SketchAndGuessGameBoard
                gameData={gameData}
                gameStatus={game.status}
                playerId={isSpectator ? '' : currentPlayer!.id}
                players={players}
                onSubmitGuess={handleSubmitGuess}
                onAdvanceRound={handleAdvanceRound}
                onChooseWord={handleChooseWord}
                onAcceptGuess={handleAcceptGuess}
                isSubmitting={isSubmitting}
                isSpectator={isSpectator}
                isHost={isCreator}
                draft={activeDraft}
                onDraftChange={handleDraftChange}
                onLiveStroke={handleLiveStroke}
                liveView={liveView}
            />
            {isFinished && !isSpectator && !overlayInspecting && (
                <GameResultOverlay
                    title={finishedMessage}
                    kicker={t('lobby.game.gameOver')}
                    accentColor={SKETCH_ACCENT}
                    accentShadowColor={SKETCH_ACCENT_DEEP}
                    icon={
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: iWon ? SKETCH_ACCENT_DEEP : SKETCH_ACCENT, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 3px rgba(255,255,255,0.15)' }}>
                            <Icon name={iWon ? 'trophy' : 'palette'} size={28} tone="on-accent" />
                        </div>
                    }
                    onInspect={() => setOverlayInspecting(true)}
                    isHost={isCreator}
                    isLoading={isReturningToWaiting}
                    onPlayAgain={handlePlayAgain}
                    onReturnToLobby={handleReturnToWaiting}
                    onLeave={() => setShowLeaveConfirmModal(true)}
                    isGuest={isGuest}
                    registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
                    inviteCode={code}
                    gameType="sketch_and_guess"
                    isRegistered={status === 'authenticated' && !isGuest}
                />
            )}
            {isFinished && !isSpectator && overlayInspecting && (
                <button
                    onClick={() => setOverlayInspecting(false)}
                    style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(31,27,22,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}
                >
                    {t('games.tictactoe.game.showResults')}
                </button>
            )}
        </div>
    )

    const scoresSection = (
        <section className="sketch-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>
                    {t('games.guess_my_drawing.game.standings')}
                </h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {t('games.guess_my_drawing.game.roundLabel', { current: gameData.currentRound, total: gameData.totalRounds })}
                </span>
            </div>
            <SketchScoreRows
                players={players}
                scores={scores}
                ranking={gameData.ranking}
                currentUserId={isSpectator ? '' : currentUserId || ''}
                drawerId={drawerId}
                isFinished={isFinished}
            />
        </section>
    )

    // The drawer is the one player who already knows the word, and the scoring
    // pays them 40 points for every correct guess – so the chat they can type
    // into is a channel they are paid to leak the answer down. They read it,
    // they do not write it, until the reveal (#1034). Everybody else talks
    // throughout: this is a party game and the talking is the point.
    const chatMutedForDrawer = isDrawer && !isFinished && phase !== 'reveal'
    const chatPlayerProfiles = new Map<string, { avatarUrl?: string | null; isPremium?: boolean }>()
    for (const p of players) chatPlayerProfiles.set(p.id, { avatarUrl: p.avatarUrl, isPremium: p.isPremium })

    const chatSection = (
        <section className="game-chat-panel">
            <Chat
                messages={chatMessages}
                onSendMessage={sendChatMessage}
                currentUserId={currentUserId || null}
                playerProfiles={chatPlayerProfiles}
                isMinimized={false}
                onToggleMinimize={() => {}}
                unreadCount={chatUnreadCount}
                someoneTyping={someoneTyping}
                fullScreen
                readOnly={isSpectator || chatMutedForDrawer}
            />
            {chatMutedForDrawer && (
                <p className="sketch-chat-note">{t('games.guess_my_drawing.game.chatLockedForDrawer')}</p>
            )}
        </section>
    )

    return (
        <div className="game-screen ttt-screen" style={themeStyle}>

            {/* ── DESKTOP ─────────────────────────────────────────────────── */}
            <div className="ttt-desktop-layout">
                <div className="ttt-grid">
                    {headerSection}
                    <div className="ttt-center-col">
                        {statusSection}
                        {renderBoardSection('sketch-board-card')}
                    </div>
                    <div className="ttt-right-col">
                        {scoresSection}
                        {chatSection}
                    </div>
                </div>
            </div>

            {/* ── PHONE LANDSCAPE ─────────────────────────────────────────── */}
            <div className="game-landscape-layout">
                <div className="game-landscape-board">
                    {renderBoardSection('sketch-board-card-landscape')}
                </div>
                {/* No standings block here, deliberately, though this is the one
                    tree with no way to reach the scores. Measured at 844x390 the
                    column is 308px and already spoken for: header 68, status 53,
                    chat's 128px floor (#902) and 18px of gaps. A standings panel
                    added as a fourth child got 79px, of which the scrolling list
                    was 4px, and it took the difference out of the header, which
                    is `overflow: hidden` and cut. Landscape gets its scores by
                    making this column's flexible region a Chat/Scores tab strip
                    like the portrait tree's, which is a layout change of its own
                    and wants its own ticket. */}
                <div className="game-landscape-side">
                    {headerSection}
                    {statusSection}
                    {chatSection}
                </div>
            </div>

            {/* ── MOBILE ──────────────────────────────────────────────────── */}
            <div className="ttt-mobile-layout">
                {headerSection}
                {statusSection}
                <GameTabs
                    tabs={[
                        { id: 'board' as const, label: t('game.ui.tabBoard') },
                        { id: 'scores' as const, label: t('games.guess_my_drawing.game.standings') },
                        { id: 'chat' as const, label: t('game.ui.tabChat'), badge: chatUnreadCount },
                    ]}
                    activeTab={mobileTab}
                    onTabChange={(id) => {
                        setMobileTab(id)
                        if (id === 'chat') resetChatUnread()
                    }}
                />
                <div className="ttt-mobile-content">
                    {mobileTab === 'board' && renderBoardSection('sketch-board-mobile')}
                    {mobileTab === 'scores' && scoresSection}
                    {mobileTab === 'chat' && chatSection}
                </div>
            </div>

            {/* ── MODALS ──────────────────────────────────────────────────── */}
            {!isSpectator && (
                <ConfirmModal
                    isOpen={showLeaveConfirmModal}
                    onClose={() => setShowLeaveConfirmModal(false)}
                    onConfirm={handleLeave}
                    title={t('game.ui.leave')}
                    message={t('game.ui.leaveConfirm')}
                    confirmText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    variant="danger"
                    icon={<LeaveIcon size={28} />}
                />
            )}
            {!isSpectator && game.status === 'playing' && <ReactionOverlay lobbyCode={code} />}
        </div>
    )
}
