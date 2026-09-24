'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
    BOARD_SIZE,
    CheckersGame,
    CheckersGameData,
    CheckersMoveRecord,
    CheckersStep,
    Side,
    Square,
    isDarkSquare,
    isKing,
    pieceSide,
    sameSquare,
} from '@/lib/games/checkers-game'
import { clientLogger } from '@/lib/client-logger'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { AnyGameState, Game, GameUpdatePayload } from '@/types/game'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import { Move } from '@/lib/game-engine'
import GameIcon from '@/components/GameIcon'
import { trackLobbyLeaveRedirect, trackMoveSubmitApplied } from '@/lib/analytics'
import { sounds } from '@/lib/sounds'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import Chat from '@/components/Chat'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GameRoomCard from '@/components/game-chrome/GameRoomCard'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
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

// ─── Design ───────────────────────────────────────────────────────────────────

// Fixed colours, not theme tokens: like Connect Four's board, a checkerboard is
// a self-contained object that must read the same in light and dark theme.
const SQUARE_LIGHT = '#F2E1C2'
const SQUARE_DARK = '#9C6A43'
const FRAME = '#3B2A1E'
const PIECE_DARK = '#2A2420'
const PIECE_LIGHT = '#FFF6E4'
const HIGHLIGHT = '#35C28F'
const LAST_MOVE_TINT = 'rgba(255,196,77,0.55)'
/** Accent per side for the chrome: the player cards, the banner bar. */
const SIDE_ACCENT: Record<Side, string> = { 1: 'var(--bd-coral)', 2: 'var(--bd-sun)' }

const FILES = 'abcdefgh'
/** Squares named from Dark's side, the way a printed diagram names them. */
function squareName([r, c]: Square): string {
    return `${FILES[c]}${BOARD_SIZE - r}`
}

function describeMove(record: CheckersMoveRecord): string {
    const joiner = record.captured.length > 0 ? '×' : '–'
    return record.path.map(squareName).join(joiner)
}

function CrownMark({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" width="46%" height="46%" aria-hidden="true" style={{ display: 'block' }}>
            <path d="M4 17h16l1.4-9.2-5 3.6L12 5l-4.4 6.4-5-3.6z" fill={color} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
    )
}

function CheckersPiece({ side, king, faded }: { side: Side; king: boolean; faded?: boolean }) {
    const fill = side === 1 ? PIECE_DARK : PIECE_LIGHT
    const ring = side === 1 ? 'rgba(255,255,255,0.22)' : 'rgba(120,90,50,0.35)'
    return (
        <div
            className="ck-piece"
            style={{
                background: fill,
                boxShadow: `inset 0 0 0 3px ${ring}, 0 3px 0 rgba(0,0,0,0.35)`,
                opacity: faded ? 0.35 : 1,
            }}
        >
            {king && <CrownMark color={side === 1 ? '#FFC44D' : '#B7791F'} />}
        </div>
    )
}

function CheckersBoard({
    board, flipped, selected, movable, mustCapture, destinations, lastPath, pendingCaptures, disabled, onSquareClick, squareLabel,
}: {
    board: number[][]
    flipped: boolean
    selected: Square | null
    movable: Square[]
    mustCapture: boolean
    destinations: Square[]
    lastPath: Square[]
    pendingCaptures: Square[]
    disabled: boolean
    onSquareClick: (r: number, c: number) => void
    squareLabel: (square: Square) => string
}) {
    const order = Array.from({ length: BOARD_SIZE }, (_, i) => (flipped ? BOARD_SIZE - 1 - i : i))
    return (
        <div className="ck-board" style={{ background: FRAME }} data-testid="checkers-board">
            {order.map((r) =>
                order.map((c) => {
                    const dark = isDarkSquare(r, c)
                    const cell = board[r]?.[c] ?? 0
                    const side = pieceSide(cell)
                    const isSelected = sameSquare(selected, r, c)
                    const isMovable = movable.some(([mr, mc]) => mr === r && mc === c)
                    const isDestination = destinations.some(([dr, dc]) => dr === r && dc === c)
                    const onLastPath = lastPath.some(([lr, lc]) => lr === r && lc === c)
                    const isPendingCapture = pendingCaptures.some(([pr, pc]) => pr === r && pc === c)
                    const clickable = !disabled && dark && (isMovable || isDestination || isSelected)
                    let ring = 'none'
                    if (isSelected) ring = `inset 0 0 0 3px ${HIGHLIGHT}`
                    else if (isMovable && mustCapture) ring = `inset 0 0 0 3px ${HIGHLIGHT}`
                    else if (isMovable) ring = `inset 0 0 0 2px rgba(53,194,143,0.55)`
                    return (
                        <button
                            key={`${r}-${c}`}
                            type="button"
                            className="ck-square"
                            data-square={squareName([r, c])}
                            data-movable={isMovable || undefined}
                            data-destination={isDestination || undefined}
                            aria-label={squareLabel([r, c])}
                            aria-pressed={isSelected || undefined}
                            disabled={!dark || disabled}
                            onClick={() => clickable && onSquareClick(r, c)}
                            style={{
                                background: dark ? SQUARE_DARK : SQUARE_LIGHT,
                                boxShadow: ring,
                                cursor: clickable ? 'pointer' : 'default',
                            }}
                        >
                            {onLastPath && <span className="ck-last" style={{ background: LAST_MOVE_TINT }} />}
                            {side && <CheckersPiece side={side} king={isKing(cell)} faded={isPendingCapture} />}
                            {isDestination && <span className="ck-dot" style={{ background: HIGHLIGHT }} />}
                        </button>
                    )
                })
            )}
        </div>
    )
}

function SideBadge({ side }: { side: Side }) {
    return (
        <div style={{
            position: 'absolute', bottom: -3, right: -3, width: 20, height: 20,
            borderRadius: '50%', background: side === 1 ? PIECE_DARK : PIECE_LIGHT,
            border: '2px solid var(--bd-ink)', boxShadow: '1px 1px 0 var(--bd-ink)',
        }} />
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

interface CheckersLobbyPageProps {
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

export default function CheckersLobbyPage({ code, isSpectator = false, onGameReset }: CheckersLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<Game | null>(null)
    const [gameEngine, setGameEngine] = useState<CheckersGame | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
    const [isRematchSubmitting, setIsRematchSubmitting] = useState(false)
    const [selected, setSelected] = useState<Square | null>(null)
    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(code, 'Checkers')
    // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
    useLobbyHeartbeat(code, !isSpectator)
    const isMoveSubmittingRef = React.useRef(false)
    const freshnessRef = React.useRef(createFreshnessWatermark())
    const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())
    const lifecycleRedirectInFlightRef = React.useRef(false)
    const activeGameIdRef = React.useRef<string | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'checkers').minPlayersRequired

    const [mobileTab, setMobileTab] = useState<'board' | 'history' | 'chat'>('board')
    const [overlayInspecting, setOverlayInspecting] = useState(false)

    // Shared chat pipeline (#736).
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
                source: 'checkers_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'checkers',
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
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'checkers-lifecycle-redirect' })
        clientLogger.warn('Checkers lifecycle redirect triggered', { code, reason, target: '/games' })
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
            // #985: refuse a snapshot older than the one on screen.
            const freshness = decideFreshness(freshnessRef.current, authoritativeState, {
                trusted: options?.trusted,
                moveInFlight: isMoveSubmittingRef.current,
            })
            if (!freshness.accept) {
                clientLogger.debug('Ignoring stale game state', { gameId, reason: freshness.reason })
                return true
            }
            if (!authoritativeState || typeof authoritativeState !== 'object') return false
            const authoritativeEngine = new CheckersGame(gameId)
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
                // #987: only leave when the lobby is genuinely gone.
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
                const engine = new CheckersGame(activeGame.id)
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
            showToast.errorFrom(error, 'games.checkers.game.loadFailed')
            setLoading(false)
        }
    }, [code, router])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({ gameStatus: game?.status, lobbyIsActive: lobby?.isActive })
        if (redirectReason) triggerLifecycleRedirect(redirectReason)
    }, [game?.status, lobby?.isActive, triggerLifecycleRedirect])

    useEffect(() => { setOverlayInspecting(false) }, [game?.status])

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('Checkers game abandoned:', data)
        if (isLeavingLobbyRef.current) return
        void loadLobby()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobby, triggerLifecycleRedirect, isLeavingLobbyRef])

    const handlePlayerLeft = useCallback((data: {
        userId: string; username?: string; playerName?: string; remainingPlayers?: number;
        nextCreatorId?: string; nextCreatorName?: string; gameTerminal?: boolean;
    }) => {
        clientLogger.log('Checkers player left:', data)
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
    }, [status, isGuest, guestToken, loadLobby, isSpectator])

    const handleGameUpdate = useCallback((payload: GameUpdatePayload) => {
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
        // #987: Supabase Broadcast has no replay buffer; resync after a gap.
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
        options?: { autoActionContext?: AutoActionContext; isAutoAction?: boolean }
    ): Promise<boolean> => {
        if (!gameEngine || !game || isMoveSubmittingRef.current) return false
        const isAutoAction = options?.isAutoAction === true
        const normalizedAutoActionContext = options?.autoActionContext
        const submitStartedAt = Date.now()
        let responseStatus: number | undefined
        try {
            const userId = getCurrentUserId()
            if (!userId) return false
            const optimisticEngine = new CheckersGame(game.id)
            optimisticEngine.restoreState(gameEngine.getState())
            if (!optimisticEngine.validateMove(move)) {
                if (!isAutoAction) showToast.error('errors.invalidActionData')
                return false
            }
            isMoveSubmittingRef.current = true
            setIsMoveSubmitting(true)
            let optimisticState = optimisticEngine.getState()
            if (!isAutoAction) {
                // makeMove, not processMove: a hop that ends the turn must also
                // advance the turn index, or the optimistic board would still
                // show it as our move.
                optimisticEngine.makeMove(move)
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
            if (isAutoAction && isExpectedAutoActionSkip(res.status, data)) return false
            if (!res.ok) {
                trackMoveSubmitApplied({ gameType: 'checkers', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'checkers_page' })
                clientLogger.error('Move failed:', data?.error)
                if (!isAutoAction) showToast.error('games.checkers.game.moveFailed')
                await loadLobby()
                return false
            }
            const authoritativeState = data?.game?.state
            if (authoritativeState && !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status, { trusted: true })) await loadLobby()
            trackMoveSubmitApplied({ gameType: 'checkers', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: true, applied: true, statusCode: responseStatus, source: 'checkers_page' })
            const resolvedEngine = isAutoAction
                ? (() => {
                    if (!authoritativeState || typeof authoritativeState !== 'object') return null
                    const ae = new CheckersGame(game.id)
                    ae.restoreState(authoritativeState as AnyGameState)
                    return ae
                })()
                : optimisticEngine
            const winner = resolvedEngine?.checkWinCondition()
            if (winner || resolvedEngine?.getState().status === 'finished') {
                if (winner) {
                    showToast.success('games.checkers.game.gameWon')
                    if (winner.id === getCurrentUserId()) sounds.play('win')
                } else showToast.info('game.ui.gameFinished')
            }
            return true
        } catch (error) {
            trackMoveSubmitApplied({ gameType: 'checkers', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'checkers_page' })
            clientLogger.error('Error making move:', error)
            if (!isAutoAction) showToast.errorFrom(error, 'games.checkers.game.moveFailed')
            await loadLobby()
            return false
        } finally {
            isMoveSubmittingRef.current = false
            setIsMoveSubmitting(false)
        }
    }, [applyAuthoritativeState, gameEngine, game, getCurrentUserId, loadLobby, isGuest])

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
    const turnTimerLimit =
        typeof lobby?.turnTimer === 'number' && Number.isFinite(lobby.turnTimer) && lobby.turnTimer > 0
            ? Math.floor(lobby.turnTimer)
            : 60

    const { triggerBotTurn } = useBotTurn({
        game,
        gameEngine,
        code,
        isGameStarted: game?.status === 'playing',
        isSpectator,
        gameType: lobby?.gameType,
        reconcileWithServerSnapshot: loadLobby,
    })

    const { timeLeft } = useGameTimer({
        isMyTurn: isSpectator ? false : isMyTurn(),
        gameState: timerState,
        turnTimerLimit,
        onTimeout: async (): Promise<boolean> => {
            if (!gameEngine || !game || !isMyTurn()) {
                // Fail-safe: if it's a stuck bot's turn, force-trigger the bot move.
                if (gameEngine && game && Array.isArray(game.players)) {
                    const currentPlayer = gameEngine.getCurrentPlayer()
                    const currentGamePlayer = currentPlayer
                        ? game.players.find((p) => p.userId === currentPlayer.id)
                        : null
                    const isBotTurn = !!(currentGamePlayer?.user?.bot || currentGamePlayer?.bot)
                    if (isBotTurn && currentPlayer?.id) {
                        clientLogger.warn('Checkers timer expired on bot turn, triggering fallback bot action', {
                            botUserId: currentPlayer.id,
                            gameId: game.id,
                        })
                        void triggerBotTurn(currentPlayer.id, game.id)
                        return false
                    }
                }
                // #989: the absent player's turn is resolved by a lobby resync.
                const decision = stuckTurnRecoveryRef.current.decide(
                    turnSignatureOf(timerState?.currentPlayerIndex, timerState?.lastMoveAt),
                    Date.now()
                )
                if (decision === 'give-up') return true
                if (decision === 'resync') {
                    clientLogger.warn('Turn timer expired on an absent player, asking the server', { code })
                    void loadLobby()
                }
                return false
            }
            const userId = getCurrentUserId()
            if (!userId) return false
            const autoActionContext = buildAutoActionContext(userId)
            if (!autoActionContext) return false
            clientLogger.warn('Checkers turn timer expired, forfeiting round', { code, gameId: game.id, userId })
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
        setIsRematchSubmitting(true)
        try {
            // Same room, same players: next-round on this game first.
            const response = await fetchWithGuest(`/api/game/${game.id}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: game.id, move: { type: 'next-round', data: {} }, userId }),
            })
            const data = await response.json().catch(() => null)
            if (response.ok) {
                const authoritativeState = data?.game?.state
                if (!authoritativeState || !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status, { trusted: true })) await loadLobby()
                showToast.success('lobby.game.next_round')
                return
            }
            // next-round failed (e.g., game already cleaned up) — start a fresh game.
            const newGameResponse = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameType: 'checkers', lobbyId: lobby.id }),
            })
            const newGameData = await newGameResponse.json().catch(() => null)
            if (!newGameResponse.ok) throw new Error((typeof newGameData?.details === 'string' && newGameData.details) || 'Failed to start rematch')
            await loadLobby()
            showToast.success('games.checkers.game.playAgain')
        } catch (error) {
            clientLogger.error('Failed to start Checkers rematch:', error)
            showToast.errorFrom(error, 'games.checkers.game.moveFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [applyAuthoritativeState, code, game, gameEngine, getCurrentUserId, lobby, loadLobby, router])

    const handleReturnToWaiting = useCallback(async () => {
        const userId = getCurrentUserId()
        if (!userId || !lobby || lobby.creatorId !== userId) return
        setIsRematchSubmitting(true)
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}/return-to-waiting`, { method: 'POST' })
            if (!res.ok) throw new Error('Failed to return to waiting room')
            if (onGameReset) onGameReset()
            else router.push(`/lobby/${code}`)
        } catch (error) {
            clientLogger.error('Failed to return to waiting room:', error)
            showToast.errorFrom(error, 'games.checkers.game.moveFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, getCurrentUserId, lobby, onGameReset, router])

    // Hoisted above the early returns so these hooks always run (Rules of Hooks).
    const earlyData = gameEngine ? (gameEngine.getState().data as CheckersGameData) : undefined
    const earlyMoveHistory = earlyData?.moveHistory
    const reversedMoveHistory = useMemo(
        () => (Array.isArray(earlyMoveHistory) ? earlyMoveHistory.slice().reverse() : []),
        [earlyMoveHistory]
    )
    const myTurnNow = !isSpectator && isMyTurn() && gameEngine?.getState().status === 'playing'
    const legalSteps: CheckersStep[] = useMemo(
        () => (gameEngine && myTurnNow ? gameEngine.getLegalSteps() : []),
        [gameEngine, myTurnNow]
    )
    const chainFrom = earlyData?.chainFrom ?? null
    // Mid-chain the chain piece is the only choice, so it is selected for the player.
    const effectiveSelected: Square | null = chainFrom ?? selected

    // A selection that is no longer a legal origin (the board moved on) is dropped.
    useEffect(() => {
        if (!selected) return
        if (!legalSteps.some((s) => s.from[0] === selected[0] && s.from[1] === selected[1])) setSelected(null)
    }, [legalSteps, selected])

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
                    <h1 className="text-2xl font-bold mb-4">{t('games.checkers.game.lobbyNotFoundTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.checkers.game.lobbyNotFoundDescription')}</p>
                    <button onClick={() => router.push('/games')} className="btn btn-primary">{t('games.checkers.game.backToLobbies')}</button>
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
                    <h1 className="text-2xl font-bold mb-4">{t('games.checkers.game.gameNotStartedTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.checkers.game.gameNotStartedDescription')}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => router.push('/games/checkers/lobbies')} className="btn btn-primary">{t('games.checkers.game.backToLobbies')}</button>
                        <button onClick={() => router.push('/games')} className="btn btn-secondary">{t('games.checkers.game.backToGames')}</button>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    const state = gameEngine.getState()
    const gameData = state.data as CheckersGameData
    const players = game?.players || []
    const currentUserId = getCurrentUserId()

    const myPlayerIndex = state.players.findIndex(p => p.id === currentUserId)
    const mySide: Side | null = myPlayerIndex === 0 ? 1 : myPlayerIndex === 1 ? 2 : null

    const getDisplayName = (playerId: string) => {
        const lp = players.find(p => p.userId === playerId)
        return lp?.user?.username || lp?.name || state.players.find(p => p.id === playerId)?.name || t('games.checkers.game.unknownPlayer')
    }
    const isBotPlayer = (playerId: string | undefined) => {
        if (!playerId) return false
        const lp = players.find(p => p.userId === playerId)
        return !!(lp?.user?.bot || lp?.bot)
    }

    const p1Id = state.players[0]?.id
    const p2Id = state.players[1]?.id
    const p1Name = p1Id ? getDisplayName(p1Id) : t('games.checkers.game.side1')
    const p2Name = p2Id ? getDisplayName(p2Id) : t('games.checkers.game.side2')
    const getPlayerAvatar = (userId: string): string | null => {
        const p = players.find(lp => lp.userId === userId)
        return p?.user?.avatarUrl ?? p?.user?.image ?? null
    }
    const getIsPremium = (playerId: string) => {
        const lp = players.find(p => p.userId === playerId)
        return !!(lp?.user as { isPremium?: boolean } | undefined)?.isPremium
    }

    const p1Wins = state.players[0]?.score ?? 0
    const p2Wins = state.players[1]?.score ?? 0

    const countPieces = (side: Side) => gameData.board.reduce(
        (total, row, r) => total + row.reduce<number>((n, cell, c) => (
            pieceSide(cell) === side && !gameData.pendingCaptures.some(([pr, pc]) => pr === r && pc === c) ? n + 1 : n
        ), 0),
        0
    )

    const winnerSide = gameData.winner
    const isDraw = winnerSide === 'draw'
    const winnerName = winnerSide && !isDraw ? (winnerSide === 1 ? p1Name : p2Name) : null
    const loserName = winnerSide && !isDraw ? (winnerSide === 1 ? p2Name : p1Name) : null
    const currentPlayerName = gameData.currentSide === 1 ? p1Name : p2Name
    const moveHistory = Array.isArray(gameData.moveHistory) ? gameData.moveHistory : []

    const finishedMessage = isDraw
        ? t('games.checkers.game.drawRule')
        : winnerName ? t('games.checkers.game.playerWins', { player: winnerName }) : t('games.checkers.game.gameWon')
    const endReasonLine = !isFinished || isDraw || !loserName
        ? null
        : gameData.endReason === 'timeout'
            ? t('games.checkers.game.timeoutLoss', { player: loserName })
            : t('games.checkers.game.noMovesLeft', { player: loserName })

    // ─── Board interaction ────────────────────────────────────────────────────

    const boardDisabled = isSpectator || !myTurnNow || isFinished || isMoveSubmitting
    const mustCapture = legalSteps.length > 0 && legalSteps[0].capture !== null
    const movablePieces: Square[] = chainFrom
        ? [chainFrom]
        : legalSteps.reduce<Square[]>((list, s) => (
            list.some(([r, c]) => r === s.from[0] && c === s.from[1]) ? list : [...list, s.from]
        ), [])
    const destinations: Square[] = effectiveSelected
        ? legalSteps.filter((s) => sameSquare(s.from, effectiveSelected[0], effectiveSelected[1])).map((s) => s.to)
        : []

    const handleSquareClick = (r: number, c: number) => {
        if (boardDisabled) return
        const userId = getCurrentUserId()
        if (!userId) return
        if (effectiveSelected && destinations.some(([dr, dc]) => dr === r && dc === c)) {
            const from = effectiveSelected
            setSelected(null)
            void handleMove({ playerId: userId, type: 'step', data: { from, to: [r, c] }, timestamp: new Date() })
            return
        }
        if (chainFrom) return
        if (movablePieces.some(([mr, mc]) => mr === r && mc === c)) {
            setSelected(sameSquare(selected, r, c) ? null : [r, c])
            return
        }
        setSelected(null)
    }

    // Tapping one of your own pieces that cannot move while a capture is on is
    // the moment a player would otherwise meet a bare "illegal move": say why.
    const handleBoardClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        if (boardDisabled || !mustCapture || chainFrom) return
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')
        if (!target || target.dataset.movable || target.dataset.destination) return
        const name = target.dataset.square ?? ''
        const c = FILES.indexOf(name[0])
        const r = BOARD_SIZE - Number(name.slice(1))
        if (mySide && pieceSide(gameData.board[r]?.[c] ?? 0) === mySide) {
            showToast.info('games.checkers.game.mustCapture', undefined, undefined, { id: 'checkers-must-capture' })
        }
    }

    const hint = isFinished || isSpectator
        ? null
        : !myTurnNow
            ? null
            : chainFrom
                ? t('games.checkers.game.continueJump')
                : mustCapture
                    ? t('games.checkers.game.mustCapture')
                    : t('games.checkers.game.selectPiece')
    const lastMoveLine = gameData.lastMove ? `${t('games.checkers.game.lastMove')}: ${describeMove(gameData.lastMove)}` : t('games.checkers.game.noMovesYet')

    // ─── Sections ─────────────────────────────────────────────────────────────

    // Inline, not a flex row: the card's subline truncates with an ellipsis on a
    // narrow phone, and a flex child would be clipped instead.
    const renderSubline = (playerId: string | undefined, side: Side) => (
        <>
            {isBotPlayer(playerId) && (
                <span className="bd-chip bd-chip-lav" style={{ padding: '0 5px', fontSize: 9, marginRight: 4 }}>{t('game.ui.botBadge')}</span>
            )}
            {t('games.checkers.game.piecesLeft', { count: countPieces(side) })}
        </>
    )

    const headerSection = (
        <div className="ttt-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(255,107,91,0.08) 100%)', padding: '12px 16px', overflow: 'hidden' }}>
            <GameScoreboardHeader
                leftCard={<GamePlayerCard name={p1Name} isActive={!isFinished && gameData.currentSide === 1} isMe={mySide === 1} isWinner={!isDraw && winnerSide === 1} side="left" avatarSrc={p1Id ? getPlayerAvatar(p1Id) : null} isPremium={p1Id ? getIsPremium(p1Id) : false} accentColor={SIDE_ACCENT[1]} subline={renderSubline(p1Id, 1)} cornerBadge={<SideBadge side={1} />} />}
                center={
                    <>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                            <GameIcon gameId="checkers" accentColor="var(--bd-coral)" size={18} />
                        </div>
                        <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                            {p1Wins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{p2Wins}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                            {t('games.checkers.game.winsLabel')}
                        </div>
                    </>
                }
                centerCompact={
                    <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {p1Wins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>:</span>{p2Wins}
                    </div>
                }
                rightCard={<GamePlayerCard name={p2Name} isActive={!isFinished && gameData.currentSide === 2} isMe={mySide === 2} isWinner={!isDraw && winnerSide === 2} side="right" avatarSrc={p2Id ? getPlayerAvatar(p2Id) : null} isPremium={p2Id ? getIsPremium(p2Id) : false} accentColor={SIDE_ACCENT[2]} subline={renderSubline(p2Id, 2)} cornerBadge={<SideBadge side={2} />} />}
            />
        </div>
    )

    const statusSection = (
        <GameStatusBanner
            isFinished={isFinished}
            isDraw={isDraw}
            finishedMessage={finishedMessage}
            activeTitle={currentPlayerName}
            meta={`#${gameData.moveCount + 1}`}
            secs={timeLeft}
            turnTimerLimit={turnTimerLimit}
            isYourTurn={!isSpectator && isMyTurn()}
            barColor={SIDE_ACCENT[gameData.currentSide]}
            leadingIcon={<div style={{ width: 24, height: 24, borderRadius: '50%', background: gameData.currentSide === 1 ? PIECE_DARK : PIECE_LIGHT, flexShrink: 0, boxShadow: '0 0 0 2px var(--bd-ink)' }} />}
            isSpectator={isSpectator}
        />
    )

    // Whether chat shows decides whether the Moves card spans the right column (#898).
    const hasMultipleHumans = players.filter((p) => !p.user?.bot && !p.bot).length >= 2
    const showChat = hasMultipleHumans || isSpectator

    const historySection = (
        <div className={`ttt-history-card${showChat ? '' : ' ttt-history-card--fill'}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('game.ui.moves')}</h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {moveHistory.length}
                </span>
            </div>
            <div className="ttt-history-list">
                {moveHistory.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.checkers.game.noMovesYet')}</div>
                    : reversedMoveHistory.map((m: CheckersMoveRecord, index) => (
                        <div key={`${m.timestamp}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bd-card-warm)' }}>
                            <span style={{ color: 'var(--bd-ink-muted)', width: 22, fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>
                                #{String(moveHistory.length - index).padStart(2, '0')}
                            </span>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: m.side === 1 ? PIECE_DARK : PIECE_LIGHT, flexShrink: 0, boxShadow: '0 0 0 1.5px var(--bd-ink)' }} />
                            <span style={{ color: 'var(--bd-ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {m.side === 1 ? p1Name : p2Name}
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: 12, fontFamily: 'ui-monospace,monospace', fontWeight: 700, flexShrink: 0, color: 'var(--bd-ink)' }}>
                                {describeMove(m)}{m.promoted ? ` (${t('games.checkers.game.kingLabel')})` : ''}
                            </span>
                        </div>
                    ))
                }
            </div>
        </div>
    )

    const showsResultOverlay = isFinished && !isSpectator && !overlayInspecting

    const renderBoardSection = () => (
        <div className={`ttt-board-card${showsResultOverlay ? ' ttt-board-card--result' : ''}`} style={{ position: 'relative' }}>
            <div className="ttt-board-surface" onClickCapture={handleBoardClickCapture}>
                <CheckersBoard
                    board={gameData.board}
                    flipped={mySide === 2}
                    selected={effectiveSelected}
                    movable={boardDisabled ? [] : movablePieces}
                    mustCapture={mustCapture}
                    destinations={boardDisabled ? [] : destinations}
                    lastPath={gameData.lastMove?.path ?? []}
                    pendingCaptures={gameData.pendingCaptures}
                    disabled={boardDisabled}
                    onSquareClick={handleSquareClick}
                    squareLabel={(square) => t('games.checkers.game.square', { square: squareName(square) })}
                />
                {isFinished && !isSpectator && overlayInspecting && (
                    <button
                        data-testid="show-results-pill"
                        onClick={() => setOverlayInspecting(false)}
                        style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(31,27,22,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}
                    >
                        {t('games.checkers.game.showResults')}
                    </button>
                )}
            </div>
            {showsResultOverlay && (
                <GameResultOverlay
                    title={isDraw ? t('games.checkers.game.draw') : winnerName ? t('games.checkers.game.playerWins', { player: winnerName }) : t('games.checkers.game.gameWon')}
                    kicker={isDraw ? t('games.checkers.game.drawRule') : endReasonLine ?? undefined}
                    isDraw={isDraw}
                    accentColor="var(--bd-mint-deep)"
                    accentShadowColor="rgba(0,0,0,0.25)"
                    onInspect={() => setOverlayInspecting(true)}
                    isHost={!!lobby && lobby.creatorId === currentUserId}
                    isLoading={isRematchSubmitting}
                    onPlayAgain={handlePlayAgain}
                    onReturnToLobby={handleReturnToWaiting}
                    onLeave={() => setShowLeaveConfirmModal(true)}
                    isGuest={isGuest}
                    registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
                    inviteCode={code}
                    gameType="checkers"
                    isRegistered={status === 'authenticated' && !isGuest}
                />
            )}
        </div>
    )

    // One line under the board, always the same height: what to do now on your
    // turn (forced captures are explained here, not by a rejected move), and the
    // last move otherwise.
    const hintSection = (
        <div
            className="ck-hint"
            data-testid="checkers-hint"
            data-must-capture={mustCapture || undefined}
            style={{ color: hint && (mustCapture || chainFrom) ? 'var(--bd-mint-deep)' : 'var(--bd-ink-soft)' }}
        >
            {hint ?? lastMoveLine}
        </div>
    )

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

    const themeStyle = getThemePageStyle(lobby.theme)

    // Room card beside the scoreboard (layout DoD, scheme A): game, room code,
    // invite link, and Leave.
    const roomCardProps = {
        gameId: 'checkers',
        title: t('games.checkers.name'),
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
                        {renderBoardSection()}
                        {hintSection}
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
                    {renderBoardSection()}
                </div>
                <div className="game-landscape-side">
                    <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                    {statusSection}
                    {hintSection}
                    {chatSection ?? historySection}
                </div>
            </div>

            {/* ── MOBILE ──────────────────────────────────────────────────── */}
            <div className="ttt-mobile-layout">
                <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                {statusSection}
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
                            {hintSection}
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
