'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
    TicTacToeGame,
    TicTacToeGameData,
    TicTacToeMoveRecord,
    TicTacToePendingRequest,
    PlayerSymbol,
    CellValue,
    isTicTacToeMatchComplete,
} from '@/lib/games/tic-tac-toe-game'
import { clientLogger } from '@/lib/client-logger'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { AnyGameState, Game, GameUpdatePayload } from '@/types/game'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import { Move } from '@/lib/game-engine'
import { trackLobbyLeaveRedirect, trackMoveSubmitApplied } from '@/lib/analytics'
import { sounds } from '@/lib/sounds'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import Chat from '@/components/Chat'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
import GameRoomCard from '@/components/game-chrome/GameRoomCard'
import { useGameTimer } from './hooks/useGameTimer'
import { useBotTurn } from './hooks/useBotTurn'
import { useLobbyChat, useLobbyChatHistory } from './hooks/useLobbyChat'
import { createFreshnessWatermark, decideFreshness, resetFreshnessWatermark } from '@/lib/game-state-freshness'
import { isLobbyGoneStatus } from '@/lib/lobby-fetch-status'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'

/** `activeGame.state` arrives as a JSON string from the lobby route and as an object elsewhere. */
function parseLobbyGameState(activeGame: unknown): unknown {
    const raw = (activeGame as { state?: unknown } | null)?.state
    if (typeof raw !== 'string') return raw ?? null
    try {
        return JSON.parse(raw || '{}')
    } catch {
        return null
    }
}


// ─── Design sub-components ───────────────────────────────────────────────────

function tttCoord(row: number, col: number) {
    return ['A', 'B', 'C'][col] + (row + 1)
}

function TttMark({ mark, size = 24, responsive = false, pop = false }: {
    mark: 'X' | 'O'; size?: number; responsive?: boolean; pop?: boolean
}) {
    const stroke = mark === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)'
    const anim = pop ? 'ttt-mark-in 0.28s cubic-bezier(0.2,1.6,0.4,1) both' : undefined
    if (responsive) {
        return (
            <span style={{ display: 'inline-grid', placeItems: 'center', width: '60%', height: '60%', animation: anim }}>
                {mark === 'X'
                    ? <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                        <path d="M5 5L19 19" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
                        <path d="M19 5L5 19" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                    : <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                        <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth="2.6" fill="none" />
                    </svg>}
            </span>
        )
    }
    const sw = Math.max(3, size * 0.11)
    return (
        <span style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, animation: anim }}>
            {mark === 'X'
                ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path d="M5 5L19 19" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
                    <path d="M19 5L5 19" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
                </svg>
                : <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth={sw} fill="none" />
                </svg>}
        </span>
    )
}

function TttBoard({ board, winningLine, onCellClick, disabled, testId }: {
    board: CellValue[][];
    winningLine: [number, number][] | null;
    onCellClick: (row: number, col: number) => void;
    disabled: boolean;
    testId?: string;
}) {
    const isWin = (r: number, c: number) => winningLine?.some(([wr, wc]) => wr === r && wc === c) ?? false
    // Partially-restored or mismatched game state can arrive without a board;
    // rendering an empty grid beats crashing the whole page (#771).
    const safeBoard: CellValue[][] = Array.isArray(board)
        ? board
        : [[null, null, null], [null, null, null], [null, null, null]]
    return (
        <div className="ttt-board-wrap">
            <div className="ttt-board" data-testid={testId}>
                {safeBoard.map((row, ri) =>
                    row.map((cell, ci) => (
                        <button
                            key={`${ri}-${ci}`}
                            className={`ttt-cell${isWin(ri, ci) ? ' ttt-win' : ''}`}
                            onClick={() => onCellClick(ri, ci)}
                            disabled={disabled || !!cell}
                            aria-label={`cell ${tttCoord(ri, ci)}`}
                        >
                            {!cell && <span className="ttt-cell-coord">{tttCoord(ri, ci)}</span>}
                            {cell && <TttMark mark={cell} responsive pop />}
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}

function TttCornerMark({ mark }: { mark: 'X' | 'O' }) {
    return (
        <div style={{
            position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 7,
            background: 'var(--bd-bg)', border: '2px solid var(--bd-ink)', display: 'grid', placeItems: 'center',
        }}>
            <TttMark mark={mark} size={14} />
        </div>
    )
}

function TttBgGrid() {
    return (
        <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
            <path d="M33 10 V90 M67 10 V90 M10 33 H90 M10 67 H90" style={{ stroke: 'var(--bd-ink)' }} strokeWidth="3" strokeLinecap="round" opacity="0.15" />
            <path d="M22 22 L30 30 M30 22 L22 30" style={{ stroke: 'var(--bd-coral)' }} strokeWidth="3" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" style={{ stroke: 'var(--bd-lav)' }} strokeWidth="3" fill="none" />
            <path d="M74 70 L82 78 M82 70 L74 78" style={{ stroke: 'var(--bd-coral)' }} strokeWidth="3" strokeLinecap="round" />
        </svg>
    )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lobby {
    id: string
    code: string
    gameType: string
    creatorId: string | null
    name: string
    isActive?: boolean
    turnTimer?: number
    theme?: string
    allowSpectators?: boolean
}

interface TicTacToeLobbyPageProps {
    code: string
    isSpectator?: boolean
    onGameReset?: () => void
}

const LEAVE_REDIRECT_FALLBACK_MS = 1500
const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600

interface AutoActionContext {
    source: 'turn-timeout'
    debounceKey: string
    turnSnapshot: {
        currentPlayerId: string
        currentPlayerIndex: number
        lastMoveAt: number | null
        rollsLeft: number
        updatedAt: string | number | null
    }
}

function isExpectedAutoActionSkip(status: number, error: unknown): boolean {
    if (status === 202 || status === 409) return true

    const code =
        typeof error === 'object' && error !== null
            ? (error as Record<string, unknown>).code
            : undefined

    return code === 'TURN_ALREADY_ENDED' || code === 'AUTO_ACTION_DEBOUNCED' || code === 'STATE_CONFLICT'
}

function extractAuthoritativeStateFromGameUpdate(payload: unknown): AnyGameState | null {
    if (!payload || typeof payload !== 'object') return null
    const updatePayload = payload as GameUpdatePayload
    if (updatePayload.action !== 'state-change') return null
    const rawPayload = updatePayload.payload
    if (!rawPayload || typeof rawPayload !== 'object') return null
    const nestedState = (rawPayload as Record<string, unknown>).state
    if (nestedState && typeof nestedState === 'object') return nestedState as AnyGameState
    return rawPayload as AnyGameState
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TicTacToeLobbyPage({ code, isSpectator = false, onGameReset }: TicTacToeLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<Game | null>(null)
    const [gameEngine, setGameEngine] = useState<TicTacToeGame | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
    const [isRematchSubmitting, setIsRematchSubmitting] = useState(false)
    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(code, 'Tic-Tac-Toe')
    // Zero-signal disconnect detection (#675) — dedicated pages unmount the
    // shared lobby shell (where this also runs for waiting rooms), so each
    // needs its own heartbeat while the game itself is active.
    useLobbyHeartbeat(code, !isSpectator)
    const isMoveSubmittingRef = React.useRef(false)
    const freshnessRef = React.useRef(createFreshnessWatermark())
    const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())
    const lifecycleRedirectInFlightRef = React.useRef(false)
    const activeGameIdRef = React.useRef<string | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'tic_tac_toe').minPlayersRequired

    // Design states
    const [mobileTab, setMobileTab] = useState<'board' | 'history' | 'chat'>('board')
    const [overlayInspecting, setOverlayInspecting] = useState(false)

    // Shared chat pipeline (#736) — replaces the old hand-rolled localChat,
    // which broadcast id-less payloads straight from the client (no Redis
    // history, no server-side authz). Unread counting only matters for the
    // mobile chat tab — in the desktop/landscape trees the panel is always
    // on screen and the badge is never rendered.
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


    const trackLeaveRedirectEvent = useCallback(
        (navigation: 'router_replace' | 'window_assign_fallback') => {
            const leaveStartedAt = leaveStartedAtRef.current
            if (leaveStartedAt === null) return
            trackLobbyLeaveRedirect({
                durationMs: Date.now() - leaveStartedAt,
                isGuest,
                source: 'tic_tac_toe_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'tic_tac_toe',
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

    useEffect(() => { void router.prefetch('/games') }, [router])

    const triggerLifecycleRedirect = useCallback((reason: string) => {
        if (isLeavingLobbyRef.current || lifecycleRedirectInFlightRef.current) return
        lifecycleRedirectInFlightRef.current = true
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'ttt-lifecycle-redirect' })
        clientLogger.warn('Tic-Tac-Toe lifecycle redirect triggered', { code, reason, target: '/games' })
        router.replace('/games')
        if (typeof window !== 'undefined') {
            window.setTimeout(() => {
                if (window.location.pathname.startsWith(`/lobby/${code}`)) window.location.assign('/games')
            }, LIFECYCLE_REDIRECT_FALLBACK_MS)
        }
    }, [router, code, isLeavingLobbyRef])

    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    const applyAuthoritativeState = useCallback(
        (gameId: string, authoritativeState: unknown, statusOverride?: Game['status'], options?: { trusted?: boolean }): boolean => {
            if (!authoritativeState || typeof authoritativeState !== 'object') return false
            // #985: an unsolicited snapshot older than the one on screen used to
            // overwrite the optimistic move and make it flicker.
            const freshness = decideFreshness(freshnessRef.current, authoritativeState, {
                trusted: options?.trusted,
                moveInFlight: isMoveSubmittingRef.current,
            })
            if (!freshness.accept) {
                clientLogger.debug('Ignoring stale game state', { gameId, reason: freshness.reason })
                return true
            }
            const authoritativeEngine = new TicTacToeGame(gameId)
            authoritativeEngine.restoreState(authoritativeState as AnyGameState)
            const resolvedState = authoritativeEngine.getState()
            setGameEngine(authoritativeEngine)
            setGame((prevGame) => {
                if (!prevGame || prevGame.id !== gameId) return prevGame
                return {
                    ...prevGame,
                    status: (statusOverride ?? resolvedState.status) as Game['status'],
                    currentTurn: resolvedState.currentPlayerIndex,
                    state: JSON.stringify(authoritativeState),
                }
            })
            return true
        },
        []
    )

    useEffect(() => { activeGameIdRef.current = game?.id ?? null }, [game?.id])

    const loadLobby = useCallback(async () => {
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
            const data = await res.json()
            if (!res.ok) {
                clientLogger.error('Failed to load lobby:', data.error)
                showToast.error('errors.failedToLoad')
                // #987: only leave when the lobby is genuinely gone. A 429 from a
                // shared IP or a transient 5xx used to throw a player out of a live
                // game — and a reconnect resync is exactly when those arrive.
                if (isLobbyGoneStatus(res.status)) {
                    router.push('/games')
                }
                setLoading(false)
                return
            }
            const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(data, { includeFinished: true })
            if (!lobbyPayload) throw new Error('Invalid lobby response')
            setLobby(lobbyPayload as Lobby)
            // An explicit resync is authoritative: move the watermark with it (#985).
            decideFreshness(freshnessRef.current, parseLobbyGameState(activeGame), { trusted: true })
            setGame(activeGame as Game | null)
            if (typeof lobbyPayload?.code === 'string') {
                finalizePendingLobbyCreateMetric({ lobbyCode: lobbyPayload.code, fallbackGameType: lobbyPayload.gameType })
            }
            if (activeGame?.state) {
                const engine = new TicTacToeGame(activeGame.id)
                const parsedState = typeof activeGame.state === 'string' ? JSON.parse(activeGame.state || '{}') : activeGame.state
                if (parsedState && typeof parsedState === 'object') engine.restoreState(parsedState)
                setGameEngine(engine)
            } else {
                setGameEngine((previous) => {
                    if (previous?.getState().status === 'finished') return previous
                    return null
                })
            }
            setLoading(false)
        } catch (error) {
            clientLogger.error('Error loading lobby:', error)
            showToast.errorFrom(error, 'games.tictactoe.game.loadFailed')
            setLoading(false)
        }
    }, [code, router])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({ gameStatus: game?.status, lobbyIsActive: lobby?.isActive })
        if (redirectReason) triggerLifecycleRedirect(redirectReason)
    }, [game?.status, lobby?.isActive, triggerLifecycleRedirect])

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 Tic-Tac-Toe game abandoned:', data)
        if (isLeavingLobbyRef.current) return
        void loadLobby()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobby, triggerLifecycleRedirect, isLeavingLobbyRef])

    const handlePlayerLeft = useCallback((data: {
        userId: string; username?: string; playerName?: string; remainingPlayers?: number;
        nextCreatorId?: string; nextCreatorName?: string; gameTerminal?: boolean;
    }) => {
        clientLogger.log('📡 Tic-Tac-Toe player left:', data)
        if (isLeavingLobbyRef.current) return
        const departedPlayerName = data.username || data.playerName
        if (departedPlayerName) showToast.info('toast.playerLeft', undefined, { player: departedPlayerName })
        if (data.nextCreatorId) {
            const currentUserId = isGuest ? guestId : session?.user?.id
            if (data.nextCreatorId === currentUserId) {
                showToast.success('toast.youAreNowHost')
            } else if (data.nextCreatorName) {
                showToast.info('toast.hostReassigned', undefined, { player: data.nextCreatorName })
            }
        }
        if (!data.gameTerminal && typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
            triggerLifecycleRedirect('player-left:insufficient-players')
            return
        }
        void loadLobby()
    }, [loadLobby, minPlayersRequired, triggerLifecycleRedirect, isGuest, guestId, session?.user?.id, isLeavingLobbyRef])

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest && !isSpectator)) return
    if (isGuest && !guestToken) return
    void loadLobby()
  }, [status, isGuest, guestToken, loadLobby])

  const handleGameUpdate = useCallback((payload: GameUpdatePayload) => {
    clientLogger.log('📡 Game update received:', payload)
    const activeGameId = activeGameIdRef.current
    const directState = extractAuthoritativeStateFromGameUpdate(payload)
    if (directState && activeGameId) { applyAuthoritativeState(activeGameId, directState); return }
    void loadLobby()
  }, [applyAuthoritativeState, loadLobby])

  const handleGameReset = useCallback(() => {
    resetFreshnessWatermark(freshnessRef.current)
    if (onGameReset) onGameReset()
    else router.push(`/lobby/${code}`)
  }, [code, onGameReset, router])

  const { isConnected, isReconnecting } = useRealtimeConnection({
        // #987: Supabase Broadcast has no replay buffer, so every event that
        // landed while the socket was down is gone. Without this the board
        // stayed frozen on pre-gap state and neither player could move.
    onStateSync: async () => { await loadLobby() },
    code,
    shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken) || isSpectator),
    onGameUpdate: handleGameUpdate,
    onGameAbandoned: handleGameAbandoned,
    onPlayerLeft: handlePlayerLeft,
    onChatMessage,
    onPlayerTyping,
    onGameReset: handleGameReset,
  })

  useLobbyChatHistory({ code, isConnected, isReconnecting, mergeHistoryMessages })

    const isMyTurn = useCallback(() => {
        if (!gameEngine || !game) return false
        return gameEngine.getCurrentPlayer()?.id === getCurrentUserId()
    }, [gameEngine, game, getCurrentUserId])

    const handleMove = useCallback(async (
        move: Move,
        options?: {
            autoActionContext?: AutoActionContext
            isAutoAction?: boolean
        }
    ): Promise<boolean> => {
        if (!gameEngine || !game || isMoveSubmittingRef.current) return false
        const normalizedAutoActionContext = options?.autoActionContext
        const isAutoAction = options?.isAutoAction === true
        const submitStartedAt = Date.now()
        let responseStatus: number | undefined
        try {
            const userId = getCurrentUserId()
            if (!userId) return false
            const optimisticEngine = new TicTacToeGame(game.id)
            optimisticEngine.restoreState(gameEngine.getState())
            if (!optimisticEngine.validateMove(move)) {
                if (!isAutoAction) {
                    showToast.error('errors.invalidActionData')
                }
                return false
            }
            isMoveSubmittingRef.current = true
            setIsMoveSubmitting(true)
            let optimisticState = optimisticEngine.getState()
            if (!isAutoAction) {
                optimisticEngine.processMove(move)
                optimisticState = optimisticEngine.getState()
                setGameEngine(optimisticEngine)
                setGame((prevGame) => {
                    if (!prevGame) return prevGame
                    return {
                        ...prevGame,
                        status: optimisticState.status as Game['status'],
                        currentTurn: optimisticState.currentPlayerIndex,
                        state: JSON.stringify(optimisticState),
                    }
                })
            }
            const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: game.id, move, userId, autoActionContext: normalizedAutoActionContext }),
            })
            responseStatus = res.status
            const data = await res.json().catch(() => null)
            if (isAutoAction && isExpectedAutoActionSkip(res.status, data)) {
                return false
            }
            if (!res.ok) {
                trackMoveSubmitApplied({ gameType: 'tic_tac_toe', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'tic_tac_toe_page' })
                clientLogger.error('Move failed:', data?.error)
                if (!isAutoAction) {
                    showToast.error('games.tictactoe.game.moveFailed', undefined, { message: (typeof data?.details === 'string' && data.details) || (typeof data?.error === 'string' && data.error) || 'Failed to submit move' })
                }
                await loadLobby()
                return false
            }
            const authoritativeState = data?.game?.state
            if (authoritativeState && !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status, { trusted: true })) await loadLobby()
            trackMoveSubmitApplied({ gameType: 'tic_tac_toe', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: true, applied: true, statusCode: responseStatus, source: 'tic_tac_toe_page' })
            if (move.type === 'request-undo') {
                if (data?.autoResponse?.type === 'undo') {
                    showToast.infoText(data.autoResponse.accepted ? 'Undo request accepted.' : 'Undo request declined.')
                } else {
                    showToast.infoText('Undo request sent.')
                }
            } else if (move.type === 'request-draw') {
                if (data?.autoResponse?.type === 'draw') {
                    showToast.infoText(data.autoResponse.accepted ? 'Draw offer accepted.' : 'Draw offer declined.')
                } else {
                    showToast.infoText('Draw offer sent.')
                }
            } else if (move.type === 'respond-undo' || move.type === 'respond-draw') {
                showToast.infoText(move.data.accept === true ? 'Request accepted.' : 'Request declined.')
            } else if (move.type === 'timeout-forfeit') {
                showToast.infoText('Time expired. Round forfeited.')
            }
            const resolvedEngine = isAutoAction
                ? (() => {
                    if (!authoritativeState || typeof authoritativeState !== 'object') return null
                    const authoritativeEngine = new TicTacToeGame(game.id)
                    authoritativeEngine.restoreState(authoritativeState as AnyGameState)
                    return authoritativeEngine
                })()
                : optimisticEngine
            const winner = resolvedEngine?.checkWinCondition()
            if (winner || resolvedEngine?.getState().status === 'finished') {
                if (winner) {
                    showToast.success('games.tictactoe.game.gameWon')
                    if (winner.id === getCurrentUserId()) sounds.play('win')
                } else showToast.info('game.ui.gameFinished')
            }
            return true
        } catch (error) {
            trackMoveSubmitApplied({ gameType: 'tic_tac_toe', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'tic_tac_toe_page' })
            clientLogger.error('Error making move:', error)
            if (!isAutoAction) {
                showToast.errorFrom(error, 'games.tictactoe.game.moveFailed')
            }
            await loadLobby()
            return false
        } finally {
            isMoveSubmittingRef.current = false
            setIsMoveSubmitting(false)
        }
    }, [applyAuthoritativeState, gameEngine, game, code, getCurrentUserId, loadLobby, isGuest])

    const buildAutoActionContext = useCallback((playerId: string): AutoActionContext | null => {
        if (!gameEngine) return null
        const state = gameEngine.getState()
        const debounceKey = `${game?.id || 'unknown'}:${playerId}:${state.currentPlayerIndex}:${state.lastMoveAt ?? 'none'}`

        return {
            source: 'turn-timeout',
            debounceKey,
            turnSnapshot: {
                currentPlayerId: playerId,
                currentPlayerIndex: state.currentPlayerIndex,
                lastMoveAt: typeof state.lastMoveAt === 'number' ? state.lastMoveAt : null,
                rollsLeft: 0,
                updatedAt: state.updatedAt ? String(state.updatedAt) : null,
            },
        }
    }, [game?.id, gameEngine])

    const timerState = gameEngine?.getState() ?? null
    const timerStateData = timerState?.data as TicTacToeGameData | undefined
    const turnTimerLimit =
        typeof lobby?.turnTimer === 'number' && Number.isFinite(lobby.turnTimer) && lobby.turnTimer > 0
            ? Math.floor(lobby.turnTimer)
            : 20

    const { triggerBotTurn } = useBotTurn({
        game,
        gameEngine,
        code,
        isGameStarted: game?.status === 'playing',
        isSpectator,
        reconcileWithServerSnapshot: loadLobby,
    })

    const { timeLeft } = useGameTimer({
        isMyTurn: isSpectator ? false : isMyTurn(),
        gameState: timerStateData?.pendingRequest ? null : timerState,
        turnTimerLimit,
        onTimeout: async (): Promise<boolean> => {
            if (!gameEngine || !game || !isMyTurn()) {
                // Fail-safe: if it's a stuck bot's turn, force-trigger the bot move.
                // Safe with server-side locking/idempotency guards.
                if (gameEngine && game && Array.isArray(game.players)) {
                    const currentPlayer = gameEngine.getCurrentPlayer()
                    const currentGamePlayer = currentPlayer
                        ? game.players.find((p) => p.userId === currentPlayer.id)
                        : null
                    const isBotTurn = !!(currentGamePlayer?.user?.bot || currentGamePlayer?.bot)
                    if (isBotTurn && currentPlayer?.id) {
                        clientLogger.warn('⏰ Tic-Tac-Toe timer expired on bot turn, triggering fallback bot action', {
                            botUserId: currentPlayer.id,
                            gameId: game.id,
                        })
                        void triggerBotTurn(currentPlayer.id, game.id)
                        return false
                    }
                }
                // #989: nobody else can end this turn. The player whose turn it is
                // submits the timeout, and if they closed the tab there is no server
                // fallback for this game type — the board sat on a dead turn until
                // someone reloaded, which abandons the game and credits nobody. A
                // lobby GET runs sweepStalePlayers, which marks them gone once their
                // heartbeat is 30s stale; the leave path then steps the turn off the
                // seat (#992). Throttled, and it stops after a minute.
                const decision = stuckTurnRecoveryRef.current.decide(
                    turnSignatureOf(timerState?.currentPlayerIndex, timerState?.lastMoveAt),
                    Date.now()
                )
                if (decision === 'give-up') return true
                if (decision === 'resync') {
                    clientLogger.warn('⏰ Turn timer expired on an absent player, asking the server', { code })
                    void loadLobby()
                }
                return false
            }

            const userId = getCurrentUserId()
            if (!userId) {
                return false
            }

            const autoActionContext = buildAutoActionContext(userId)
            if (!autoActionContext) {
                return false
            }

            clientLogger.warn('⏰ Tic-Tac-Toe turn timer expired, forfeiting round', {
                code,
                gameId: game.id,
                userId,
                currentPlayerIndex: gameEngine.getState().currentPlayerIndex,
            })

            return handleMove(
                { playerId: userId, type: 'timeout-forfeit', data: {}, timestamp: new Date() },
                { autoActionContext, isAutoAction: true }
            )
        },
    })

    const handleLeave = () => {
        if (isLeavingLobbyRef.current) return
        setShowLeaveConfirmModal(false)
        leaveLobby()
        navigateAfterLeave()
    }

    const handlePlayAgain = useCallback(async () => {
        if (!lobby || !game || !gameEngine) { router.push(`/lobby/${code}`); return }
        const userId = getCurrentUserId()
        if (!userId) { router.push(`/lobby/${code}`); return }
        if (lobby.creatorId !== userId) { showToast.info('game.ui.waitingForHost'); return }
        const gameData = gameEngine.getState().data as TicTacToeGameData
        const isMatchComplete = isTicTacToeMatchComplete(gameData.match)
        setIsRematchSubmitting(true)
        let nextRoundSubmitStartedAt: number | null = null
        let nextRoundResponseStatus: number | undefined
        let nextRoundMetricTracked = false
        try {
            if (!isMatchComplete) {
                nextRoundSubmitStartedAt = Date.now()
                const response = await fetchWithGuest(`/api/game/${game.id}/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId: game.id, move: { type: 'next-round', data: {} }, userId }),
                })
                nextRoundResponseStatus = response.status
                const data = await response.json().catch(() => null)
                if (!response.ok) {
                    trackMoveSubmitApplied({ gameType: 'tic_tac_toe', moveType: 'next-round', durationMs: Date.now() - nextRoundSubmitStartedAt, isGuest, success: false, applied: false, statusCode: nextRoundResponseStatus, source: 'tic_tac_toe_page' })
                    nextRoundMetricTracked = true
                    throw new Error((typeof data?.details === 'string' && data.details) || (typeof data?.error === 'string' && data.error) || 'Failed to start next round')
                }
                const authoritativeState = data?.game?.state
                if (!authoritativeState || !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status, { trusted: true })) await loadLobby()
                trackMoveSubmitApplied({ gameType: 'tic_tac_toe', moveType: 'next-round', durationMs: Date.now() - nextRoundSubmitStartedAt, isGuest, success: true, applied: true, statusCode: nextRoundResponseStatus, source: 'tic_tac_toe_page' })
                nextRoundMetricTracked = true
                showToast.success('lobby.game.next_round')
                return
            }
            const isCreator = lobby.creatorId === userId
            if (!isCreator) { showToast.info('game.ui.waitingForHost'); return }
            const response = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameType: 'tic_tac_toe', lobbyId: lobby.id }),
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error((typeof data?.details === 'string' && data.details) || (typeof data?.error === 'string' && data.error) || 'Failed to start rematch')
            await loadLobby()
            showToast.success('games.tictactoe.game.playAgain')
        } catch (error) {
            if (!isMatchComplete && !nextRoundMetricTracked && nextRoundSubmitStartedAt !== null) {
                trackMoveSubmitApplied({ gameType: 'tic_tac_toe', moveType: 'next-round', durationMs: Date.now() - nextRoundSubmitStartedAt, isGuest, success: false, applied: false, statusCode: nextRoundResponseStatus, source: 'tic_tac_toe_page' })
            }
            clientLogger.error('Failed to continue Tic-Tac-Toe match:', error)
            showToast.errorFrom(error, 'games.tictactoe.game.continueFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [applyAuthoritativeState, code, game, gameEngine, getCurrentUserId, lobby, loadLobby, router, isGuest])

    const handleReturnToWaiting = useCallback(async () => {
        const userId = getCurrentUserId()
        if (!userId || !lobby || lobby.creatorId !== userId) return
        setIsRematchSubmitting(true)
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}/return-to-waiting`, { method: 'POST' })
            if (!res.ok) {
                const data = await res.json().catch(() => ({})) as { error?: string }
                throw new Error(data.error ?? `HTTP ${res.status}`)
            }
            if (onGameReset) onGameReset()
            else router.push(`/lobby/${code}`)
        } catch (error) {
            clientLogger.error('Failed to return to waiting room:', error)
            showToast.errorFrom(error, 'games.tictactoe.game.continueFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, getCurrentUserId, lobby, onGameReset, router])

    // ─── Design effects ───────────────────────────────────────────────────────

    // Hoisted above the early returns below so this hook always runs, regardless
    // of which (if any) early-return branch fires — violates Rules of Hooks otherwise.
    const earlyMoveHistory = gameEngine ? (gameEngine.getState().data as TicTacToeGameData).moveHistory : undefined
    const reversedMoveHistory = useMemo(
        () => (Array.isArray(earlyMoveHistory) ? earlyMoveHistory.slice().reverse() : []),
        [earlyMoveHistory]
    )

    // ─── Early returns ────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[100dvh]">
                <LoadingSpinner size="lg" />
            </div>
        )
    }

    if (!lobby) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="card max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4">{t('games.tictactoe.game.lobbyNotFoundTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.tictactoe.game.lobbyNotFoundDescription')}</p>
                    <button onClick={() => router.push('/games')} className="btn btn-primary">{t('games.tictactoe.game.backToLobbies')}</button>
                </div>
            </div>
        )
    }

    const resolvedStatus = game?.status || gameEngine?.getState().status
    const isFinished = resolvedStatus === 'finished' || gameEngine?.getState().status === 'finished'

    if (!gameEngine || (resolvedStatus !== 'playing' && resolvedStatus !== 'finished')) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="card max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4">{t('games.tictactoe.game.gameNotStartedTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.tictactoe.game.gameNotStartedDescription')}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => router.push('/games')} className="btn btn-primary">{t('games.tictactoe.game.backToLobbies')}</button>
                        <button onClick={() => router.push('/games')} className="btn btn-secondary">{t('games.tictactoe.game.backToGames')}</button>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    const state = gameEngine.getState()
    const gameData = state.data as TicTacToeGameData
    const players = game?.players || []
    const currentUserId = getCurrentUserId()
    const myPlayerIndex = state.players.findIndex(p => p.id === currentUserId)
    const mySymbol: PlayerSymbol | null = myPlayerIndex === 0 ? 'X' : myPlayerIndex === 1 ? 'O' : null
    const opponentSymbol: PlayerSymbol | null = mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : null
    const isLobbyCreator = currentUserId === lobby.creatorId

    const match = gameData.match
    const roundsPlayedNum = match?.roundsPlayed ?? 0
    const targetRounds = match?.targetRounds ?? null
    const isMatchComplete = isTicTacToeMatchComplete(
        match ?? { targetRounds: null, roundsPlayed: 0, winsBySymbol: { X: 0, O: 0 }, draws: 0 }
    )
    const xWins = match?.winsBySymbol?.X ?? 0
    const oWins = match?.winsBySymbol?.O ?? 0
    const drawsCount = match?.draws ?? 0
    const roundNum = roundsPlayedNum + (isFinished ? 0 : 1)

    const getDisplayName = (playerId: string) => {
        const lp = players.find(p => p.userId === playerId)
        return lp?.user?.username || lp?.name || state.players.find(p => p.id === playerId)?.name || 'Player'
    }
    const xName = state.players[0] ? getDisplayName(state.players[0].id) : 'Player X'
    const oName = state.players[1] ? getDisplayName(state.players[1].id) : 'Player O'
    const getPlayerAvatar = (userId: string): string | null => {
        const p = players.find(lp => lp.userId === userId)
        return p?.user?.avatarUrl ?? p?.user?.image ?? null
    }
    const xAvatar = state.players[0] ? getPlayerAvatar(state.players[0].id) : null
    const oAvatar = state.players[1] ? getPlayerAvatar(state.players[1].id) : null
    const getIsPremium = (playerId: string) => {
        const lp = players.find(p => p.userId === playerId)
        return !!(lp?.user as { isPremium?: boolean } | undefined)?.isPremium
    }
    const xIsPremium = state.players[0] ? getIsPremium(state.players[0].id) : false
    const oIsPremium = state.players[1] ? getIsPremium(state.players[1].id) : false

    const winnerSymbol = gameData.winner
    const isDraw = winnerSymbol === 'draw'
    const winnerName = winnerSymbol && !isDraw ? (winnerSymbol === 'X' ? xName : oName) : null

    const myWins = mySymbol ? (match?.winsBySymbol[mySymbol] ?? 0) : 0
    const myLosses = opponentSymbol ? (match?.winsBySymbol[opponentSymbol] ?? 0) : 0
    const moveHistory = Array.isArray(gameData.moveHistory) ? gameData.moveHistory : []
    const pendingRequest = (gameData.pendingRequest ?? null) as TicTacToePendingRequest | null
    const pendingRequesterName = pendingRequest ? getDisplayName(pendingRequest.requesterId) : null
    const isPendingResponder = !!pendingRequest && pendingRequest.responderId === currentUserId
    const isPendingRequester = !!pendingRequest && pendingRequest.requesterId === currentUserId
    const canRequestUndo = !isMoveSubmitting && !pendingRequest && moveHistory.length > 0
    const canRequestDraw = !isMoveSubmitting && !pendingRequest && !isFinished && moveHistory.length > 0

    // Cell click handler
    const handleCellClick = async (row: number, col: number) => {
        const gStatus = gameEngine.getState().status
        if (gStatus === 'finished') return
        if (!isMyTurn() || isMoveSubmitting) return
        const userId = getCurrentUserId()
        if (!userId) return
        await handleMove({ playerId: userId, type: 'place', data: { row, col }, timestamp: new Date() })
    }

    const handleRequestUndo = async () => {
        const userId = getCurrentUserId()
        if (!userId || !canRequestUndo) return
        await handleMove({ playerId: userId, type: 'request-undo', data: {}, timestamp: new Date() })
    }

    const handleRequestDraw = async () => {
        const userId = getCurrentUserId()
        if (!userId || !canRequestDraw) return
        await handleMove({ playerId: userId, type: 'request-draw', data: {}, timestamp: new Date() })
    }

    const handleRespondToRequest = async (type: 'undo' | 'draw', accept: boolean) => {
        const userId = getCurrentUserId()
        if (!userId || !pendingRequest || pendingRequest.type !== type || pendingRequest.responderId !== userId) return
        await handleMove({
            playerId: userId,
            type: type === 'undo' ? 'respond-undo' : 'respond-draw',
            data: { accept },
            timestamp: new Date(),
        })
    }

    // ─── Sections ─────────────────────────────────────────────────────────────

    const headerSection = (
        <div className="ttt-card" style={{
            background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(255,196,77,0.10) 100%)',
            overflow: 'hidden', padding: '12px 16px',
        }}>
            <div style={{ position: 'absolute', right: -30, top: -30, opacity: 0.4, transform: 'rotate(8deg)', pointerEvents: 'none' }}>
                <TttBgGrid />
            </div>
            <GameScoreboardHeader
                leftCard={<GamePlayerCard name={xName} isActive={!isFinished && gameData.currentSymbol === 'X'} isMe={mySymbol === 'X'} isWinner={!isDraw && winnerSymbol === 'X'} side="left" avatarSrc={xAvatar} isPremium={xIsPremium} accentColor="var(--bd-coral)" turnDotColor="var(--bd-mint-deep)" subline="X" cornerBadge={<TttCornerMark mark="X" />} />}
                center={
                    <>
                        <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                            Round {roundNum}
                        </div>
                        <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                            {xWins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{oWins}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                            {drawsCount} draws{targetRounds ? ` · BO${targetRounds}` : ''}
                        </div>
                    </>
                }
                centerCompact={
                    <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {xWins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>:</span>{oWins}
                    </div>
                }
                rightCard={<GamePlayerCard name={oName} isActive={!isFinished && gameData.currentSymbol === 'O'} isMe={mySymbol === 'O'} isWinner={!isDraw && winnerSymbol === 'O'} side="right" avatarSrc={oAvatar} isPremium={oIsPremium} accentColor="var(--bd-lav)" turnDotColor="var(--bd-mint-deep)" subline="O" cornerBadge={<TttCornerMark mark="O" />} />}
            />
        </div>
    )

    const statusSection = (
        <GameStatusBanner
            isFinished={isFinished}
            isDraw={isDraw}
            finishedMessage={isDraw ? t('games.tictactoe.game.catsGameFull') : t('games.tictactoe.game.playerWins', { player: winnerName })}
            activeTitle={isSpectator ? (gameData.currentSymbol === 'X' ? xName : oName) : t('games.tictactoe.game.playerTurn', { player: gameData.currentSymbol === 'X' ? xName : oName })}
            meta={isSpectator ? `#${gameData.moveCount + 1}` : t('games.tictactoe.game.moveNum', { num: gameData.moveCount + 1 })}
            secs={timeLeft}
            turnTimerLimit={turnTimerLimit}
            isYourTurn={!isSpectator && isMyTurn()}
            barColor={gameData.currentSymbol === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)'}
            leadingIcon={<TttMark mark={gameData.currentSymbol} size={22} />}
            isSpectator={isSpectator}
        />
    )

    const requestSection = !isSpectator && pendingRequest ? (
        <div style={{
            padding: '8px 10px',
            borderRadius: 12,
            background: 'var(--bd-bg)',
            border: '1.5px solid var(--bd-line)',
            boxShadow: '0 3px 10px rgba(31,27,22,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
        }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bd-ink)', lineHeight: 1.35, flex: '1 1 220px' }}>
                {pendingRequest.type === 'undo'
                    ? `${pendingRequesterName || 'Your opponent'} wants to undo the last move.`
                    : `${pendingRequesterName || 'Your opponent'} offered a draw.`}
            </div>
            {isPendingResponder ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => void handleRespondToRequest(pendingRequest.type, true)}
                        disabled={isMoveSubmitting}
                        style={{
                            padding: '6px 11px',
                            fontSize: 12,
                            borderRadius: 12,
                            fontWeight: 700,
                            background: 'var(--bd-mint-deep)',
                            color: 'white',
                            border: 'none',
                            cursor: isMoveSubmitting ? 'not-allowed' : 'pointer',
                            opacity: isMoveSubmitting ? 0.65 : 1,
                            fontFamily: 'inherit',
                        }}
                    >
                        {t('games.tictactoe.game.undoAccept')}
                    </button>
                    <button
                        onClick={() => void handleRespondToRequest(pendingRequest.type, false)}
                        disabled={isMoveSubmitting}
                        style={{
                            padding: '6px 11px',
                            fontSize: 12,
                            borderRadius: 12,
                            fontWeight: 600,
                            background: 'var(--bd-card-warm)',
                            border: '1px solid var(--bd-line)',
                            color: 'var(--bd-ink-soft)',
                            cursor: isMoveSubmitting ? 'not-allowed' : 'pointer',
                            opacity: isMoveSubmitting ? 0.65 : 1,
                            fontFamily: 'inherit',
                        }}
                    >
                        {t('games.tictactoe.game.undoDecline')}
                    </button>
                </div>
            ) : isPendingRequester ? (
                <div style={{ fontSize: 11, color: 'var(--bd-ink-muted)', whiteSpace: 'nowrap' }}>
                    {t('game.ui.waitingForResponse')}
                </div>
            ) : null}
        </div>
    ) : null

    const renderBoardSection = (testId?: string) => (
        <div className="ttt-board-card">
            <TttBoard
                board={gameData.board}
                winningLine={gameData.winningLine}
                onCellClick={handleCellClick}
                disabled={isSpectator || !isMyTurn() || isFinished || isMoveSubmitting}
                testId={testId}
            />
            {isFinished && !isSpectator && !overlayInspecting && (
                <GameResultOverlay
                    title={isDraw ? t('games.tictactoe.game.itsADraw') : t('games.tictactoe.game.playerWins', { player: winnerName })}
                    kicker={isMatchComplete ? t('games.tictactoe.game.seriesComplete') : undefined}
                    isDraw={isDraw}
                    icon={!isDraw && winnerSymbol ? (
                        <div style={{
                            width: 56, height: 56, borderRadius: '50%',
                            background: winnerSymbol === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)',
                            display: 'grid', placeItems: 'center',
                            boxShadow: '0 0 0 3px rgba(255,255,255,0.15)',
                        }}>
                            <TttMark mark={winnerSymbol as 'X' | 'O'} size={32} />
                        </div>
                    ) : undefined}
                    accentColor="var(--bd-coral)"
                    accentShadowColor="var(--bd-coral-deep)"
                    onInspect={() => setOverlayInspecting(true)}
                    isHost={isLobbyCreator}
                    isLoading={isRematchSubmitting}
                    onPlayAgain={handlePlayAgain}
                    onReturnToLobby={handleReturnToWaiting}
                    onLeave={() => setShowLeaveConfirmModal(true)}
                    actionsReplacement={isMatchComplete ? (
                        <div style={{
                            padding: '12px 20px', borderRadius: 14, fontWeight: 600, fontSize: 14,
                            background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', fontFamily: 'inherit',
                        }}>
                            {t('games.tictactoe.game.returningToLobby')}
                        </div>
                    ) : undefined}
                    isGuest={isGuest}
                    registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
                    inviteCode={code}
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

    // Leave and the spectator's way back live in the header (layout DoD); this
    // row keeps only the move requests.
    const actionsSection = isSpectator ? null : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
                onClick={() => void handleRequestUndo()}
                disabled={!canRequestUndo}
                style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    borderRadius: 14,
                    fontWeight: 600,
                    background: 'var(--bd-card-warm)',
                    border: '1px solid var(--bd-line)',
                    color: canRequestUndo ? 'var(--bd-ink-soft)' : 'var(--bd-ink-muted)',
                    cursor: canRequestUndo ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    opacity: canRequestUndo ? 1 : 0.5,
                }}
            >
                ↶ {t('games.tictactoe.game.undoBtn')}
            </button>
            <button
                onClick={() => void handleRequestDraw()}
                disabled={!canRequestDraw}
                style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    borderRadius: 14,
                    fontWeight: 600,
                    background: 'var(--bd-card-warm)',
                    border: '1px solid var(--bd-line)',
                    color: canRequestDraw ? 'var(--bd-ink-soft)' : 'var(--bd-ink-muted)',
                    cursor: canRequestDraw ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    opacity: canRequestDraw ? 1 : 0.5,
                }}
            >
                <Icon name="handshake" size={16} /> {t('games.tictactoe.game.drawBtn')}
            </button>
        </div>
    )

    // Hoisted above historySection: whether chat shows decides whether the
    // Moves card is alone in the right column, and a card that is alone has
    // to span it (#898). Chat is hidden in bot-only games (#522 parity with
    // the shared lobby shell); spectators get a read-only feed.
    const hasMultipleHumans = players.filter((p) => !p.user?.bot && !p.bot).length >= 2
    const showChat = hasMultipleHumans || isSpectator

    const historySection = (
        <div className={`ttt-history-card${showChat ? '' : ' ttt-history-card--fill'}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('game.ui.moves')}</h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {moveHistory.length}/9
                </span>
            </div>
            <div className="ttt-history-list">
                {moveHistory.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.tictactoe.game.noMovesYet')}</div>
                    : reversedMoveHistory.map((m: TicTacToeMoveRecord, index) => (
                        <div key={`${m.timestamp}-${m.row}-${m.col}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bd-card-warm)' }}>
                            <span style={{ color: 'var(--bd-ink-muted)', width: 22, fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>
                                #{String(moveHistory.length - index).padStart(2, '0')}
                            </span>
                            <TttMark mark={m.symbol} size={16} />
                            <span style={{ color: 'var(--bd-ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getDisplayName(m.playerId)}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>{tttCoord(m.row, m.col)}</span>
                        </div>
                    ))
                }
            </div>
        </div>
    )

    // Chat hidden in bot-only games (#522 parity with the shared lobby shell);
    // spectators get a read-only feed.
    const chatPlayerProfiles = (() => {
        const map = new Map<string, { avatarUrl?: string | null; isPremium?: boolean }>()
        for (const p of players) {
            if (p.userId) {
                map.set(p.userId, {
                    avatarUrl: p.user?.avatarUrl ?? p.user?.image ?? null,
                    isPremium: !!p.user?.isPremium,
                })
            }
        }
        return map
    })()

    const chatSection = showChat ? (
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
                readOnly={isSpectator}
            />
        </section>
    ) : null

    // Show score summary below player cards when match has results
    const _ = { myWins, myLosses }
    void _

    const themeStyle = getThemePageStyle(lobby.theme)

    // The room card sits to the right of the scoreboard, in the same grid row
    // and at the same height (layout DoD, scheme A): game, room code, invite
    // link, and Leave. Phones get the compact form beside the scoreboard.
    const roomCardProps = {
        gameId: 'tic-tac-toe',
        title: t('games.tictactoe.name'),
        code,
        isSpectator,
        leaveLabel: t('game.ui.leave'),
        allowSpectators: !!lobby.allowSpectators,
        onLeave: () => setShowLeaveConfirmModal(true),
    }
    const roomSection = <GameRoomCard {...roomCardProps} />
    const roomSectionCompact = <GameRoomCard {...roomCardProps} compact />

    return (
        <div className="game-screen ttt-screen" style={themeStyle}>

            {/* ── DESKTOP ─────────────────────────────────────────────────── */}
            <div className="ttt-desktop-layout">
                <div className="ttt-grid">
                    {headerSection}
                    {roomSection}
                    <div className="ttt-center-col">
                        {statusSection}
                        {requestSection}
                        {renderBoardSection('ttt-board')}
                        {actionsSection}
                    </div>
                    <div className="ttt-right-col">
                        {historySection}
                        {chatSection}
                    </div>
                </div>
            </div>

            {/* ── PHONE LANDSCAPE ─────────────────────────────────────────── */}
            <div className="game-landscape-layout">
                <div className="game-landscape-board">
                    {renderBoardSection('ttt-board-landscape')}
                </div>
                <div className="game-landscape-side">
                    <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                    {statusSection}
                    {requestSection}
                    {chatSection}
                    {actionsSection}
                </div>
            </div>

            {/* ── MOBILE ──────────────────────────────────────────────────── */}
            <div className="ttt-mobile-layout">
                <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                {statusSection}
                {requestSection}
                <GameTabs
                    tabs={[
                        { id: 'board' as const, label: t('game.ui.tabBoard') },
                        { id: 'history' as const, label: `${t('game.ui.tabMoves')} (${moveHistory.length})` },
                        ...(showChat ? [{ id: 'chat' as const, label: t('game.ui.tabChat'), badge: chatUnreadCount }] : []),
                    ]}
                    activeTab={mobileTab}
                    onTabChange={(id) => {
                        setMobileTab(id)
                        if (id === 'chat') resetChatUnread()
                    }}
                />
                <div className="ttt-mobile-content">
                    {mobileTab === 'board' && (
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {renderBoardSection()}
                            {actionsSection}
                        </div>
                    )}
                    {mobileTab === 'history' && historySection}
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
            {!isSpectator && resolvedStatus === 'playing' && (
                <ReactionOverlay lobbyCode={code} />
            )}
        </div>
    )
}
