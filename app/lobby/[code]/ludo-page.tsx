'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
    LudoGame,
    LudoColor,
    LudoEvent,
    LUDO_COLORS,
    LUDO_FINISH,
    LUDO_SAFE_SQUARES,
    LUDO_START_OFFSET,
} from '@/lib/games/ludo-game'
import {
    LUDO_HOME_COLUMN_CELLS,
    LUDO_TRACK_CELLS,
    LUDO_YARD_ORIGIN,
    ludoTokenPoint,
} from '@/lib/games/ludo-layout'
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
import ScorePop from '@/components/game-chrome/ScorePop'
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

// ─── Board ────────────────────────────────────────────────────────────────────

/** Token and yard colours; the board keeps its own light surface in both themes, like Connect Four's. */
const COLOR_FILL: Record<LudoColor, string> = {
    red: 'var(--bd-coral)',
    green: 'var(--bd-mint)',
    yellow: 'var(--bd-sun)',
    blue: 'var(--bd-sky)',
}
const BOARD_BG = '#FFF8EC'
const CELL_BG = '#FFFFFF'
const BOARD_LINE = '#1F1B16'

function tintOf(color: LudoColor): string {
    return `color-mix(in srgb, ${COLOR_FILL[color]} 30%, ${CELL_BG})`
}

function StarMark({ x, y }: { x: number; y: number }) {
    // Five-point star inside one cell, centred on (x, y).
    const points = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 0.36 : 0.15
        const a = (Math.PI / 5) * i - Math.PI / 2
        return `${(x + r * Math.cos(a)).toFixed(3)},${(y + r * Math.sin(a)).toFixed(3)}`
    }).join(' ')
    return <polygon points={points} style={{ fill: 'none', stroke: BOARD_LINE, strokeWidth: 0.06, strokeLinejoin: 'round', opacity: 0.55 }} />
}

interface BoardToken {
    playerId: string
    color: LudoColor
    token: number
    position: number
    selectable: boolean
    isMine: boolean
}

function LudoBoard({
    tokens,
    activeColors,
    onTokenClick,
    lastMovedKey,
    tokenLabel,
    boardLabel,
}: {
    boardLabel: string
    tokens: BoardToken[]
    activeColors: LudoColor[]
    onTokenClick: (token: number) => void
    lastMovedKey: string | null
    tokenLabel: (token: BoardToken) => string
}) {
    // Tokens that share a square are fanned out a little so each stays visible and tappable.
    const placed = useMemo(() => {
        const groups = new Map<string, Array<{ token: BoardToken; point: { x: number; y: number } }>>()
        for (const token of tokens) {
            const point = ludoTokenPoint(token.color, token.position, token.token)
            const key = `${point.x.toFixed(2)}:${point.y.toFixed(2)}`
            const group = groups.get(key)
            if (group) group.push({ token, point })
            else groups.set(key, [{ token, point }])
        }
        const result: Array<BoardToken & { x: number; y: number; r: number }> = []
        for (const group of groups.values()) {
            group.forEach(({ token, point }, index) => {
                const shift = group.length > 1 ? (index - (group.length - 1) / 2) * 0.24 : 0
                const isFinished = token.position >= LUDO_FINISH
                result.push({
                    ...token,
                    x: point.x + shift,
                    y: point.y + shift * 0.5,
                    r: isFinished ? 0.24 : group.length > 1 ? 0.3 : 0.36,
                })
            })
        }
        // Selectable tokens last, so they paint on top and take the tap.
        return result.sort((a, b) => Number(a.selectable) - Number(b.selectable))
    }, [tokens])

    const startSquares = new Map(LUDO_COLORS.map((color) => [LUDO_START_OFFSET[color], color] as const))

    return (
        <svg className="ludo-board" viewBox="0 0 15 15" role="img" aria-label={boardLabel} data-testid="ludo-board">
            <rect x={0} y={0} width={15} height={15} rx={0.5} style={{ fill: BOARD_BG }} />

            {/* Yards */}
            {LUDO_COLORS.map((color) => {
                const [row, col] = LUDO_YARD_ORIGIN[color]
                const inPlay = activeColors.includes(color)
                return (
                    <g key={`yard-${color}`} style={{ opacity: inPlay ? 1 : 0.35 }}>
                        <rect x={col + 0.15} y={row + 0.15} width={5.7} height={5.7} rx={0.6} style={{ fill: COLOR_FILL[color], stroke: BOARD_LINE, strokeWidth: 0.08 }} />
                        <rect x={col + 1} y={row + 1} width={4} height={4} rx={0.5} style={{ fill: CELL_BG, stroke: BOARD_LINE, strokeWidth: 0.06 }} />
                        {[[2, 2], [2, 4], [4, 2], [4, 4]].map(([dy, dx]) => (
                            <circle key={`${dy}-${dx}`} cx={col + dx} cy={row + dy} r={0.42} style={{ fill: tintOf(color), stroke: BOARD_LINE, strokeWidth: 0.04 }} />
                        ))}
                    </g>
                )
            })}

            {/* Shared track */}
            {LUDO_TRACK_CELLS.map(([row, col], index) => {
                const startColor = startSquares.get(index)
                return (
                    <g key={`track-${index}`}>
                        <rect x={col} y={row} width={1} height={1} style={{ fill: startColor ? tintOf(startColor) : CELL_BG, stroke: BOARD_LINE, strokeWidth: 0.04 }} />
                        {LUDO_SAFE_SQUARES.has(index) && !startColor && <StarMark x={col + 0.5} y={row + 0.5} />}
                    </g>
                )
            })}

            {/* Home columns */}
            {LUDO_COLORS.map((color) =>
                LUDO_HOME_COLUMN_CELLS[color].map(([row, col]) => (
                    <rect key={`home-${color}-${row}-${col}`} x={col} y={row} width={1} height={1} style={{ fill: tintOf(color), stroke: BOARD_LINE, strokeWidth: 0.04 }} />
                ))
            )}

            {/* Centre: one triangle per colour, pointing at its home column */}
            <polygon points="6,6 7.5,7.5 6,9" style={{ fill: COLOR_FILL.red, stroke: BOARD_LINE, strokeWidth: 0.05 }} />
            <polygon points="6,6 9,6 7.5,7.5" style={{ fill: COLOR_FILL.green, stroke: BOARD_LINE, strokeWidth: 0.05 }} />
            <polygon points="9,6 9,9 7.5,7.5" style={{ fill: COLOR_FILL.yellow, stroke: BOARD_LINE, strokeWidth: 0.05 }} />
            <polygon points="6,9 7.5,7.5 9,9" style={{ fill: COLOR_FILL.blue, stroke: BOARD_LINE, strokeWidth: 0.05 }} />

            {/* Tokens. Moved with a transform transition only (never layout). */}
            {placed.map((token) => {
                const key = `${token.playerId}-${token.token}`
                const interactive = token.selectable
                return (
                    <g
                        key={key}
                        className={`ludo-token${interactive ? ' ludo-token--selectable' : ''}${lastMovedKey === key ? ' ludo-token--last' : ''}`}
                        style={{ transform: `translate(${token.x}px, ${token.y}px)` }}
                        role={interactive ? 'button' : undefined}
                        tabIndex={interactive ? 0 : undefined}
                        aria-label={tokenLabel(token)}
                        data-testid={interactive ? `ludo-token-${token.token}` : undefined}
                        onClick={interactive ? () => onTokenClick(token.token) : undefined}
                        onKeyDown={interactive ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                onTokenClick(token.token)
                            }
                        } : undefined}
                    >
                        {interactive && <circle className="ludo-token__halo" r={token.r + 0.2} />}
                        {/* A generous invisible target: a cell is under 20px wide on a phone. */}
                        {interactive && <circle r={0.72} style={{ fill: 'transparent' }} />}
                        <circle r={token.r} style={{ fill: COLOR_FILL[token.color], stroke: BOARD_LINE, strokeWidth: 0.07 }} />
                        <circle r={token.r * 0.45} style={{ fill: 'rgba(255,255,255,0.55)' }} />
                    </g>
                )
            })}
        </svg>
    )
}

/** Pip layout for a die face on a 3×3 grid. */
const PIPS: Record<number, Array<[number, number]>> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function DieFace({ value, size, color, rollKey, label }: { value: number | null; size: number; color: string; rollKey?: string | number; label: string }) {
    return (
        <svg
            key={rollKey}
            width={size}
            height={size}
            viewBox="0 0 30 30"
            className={rollKey !== undefined ? 'ludo-die ludo-die--rolled' : 'ludo-die'}
            role="img"
            aria-label={label}
        >
            <rect x={1.5} y={1.5} width={27} height={27} rx={6} style={{ fill: 'var(--bd-bg)', stroke: 'var(--bd-ink)', strokeWidth: 2.5 }} />
            {value !== null && PIPS[value]?.map(([r, c]) => (
                <circle key={`${r}-${c}`} cx={8 + c * 7} cy={8 + r * 7} r={2.6} style={{ fill: color }} />
            ))}
        </svg>
    )
}

function TokenDot({ color, size = 16 }: { color: LudoColor; size?: number }) {
    return (
        <span
            aria-hidden
            style={{
                width: size, height: size, borderRadius: '50%', background: COLOR_FILL[color], flexShrink: 0,
                display: 'inline-block', boxShadow: '0 0 0 1.5px var(--bd-ink)',
            }}
        />
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

interface LudoLobbyPageProps {
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

export default function LudoLobbyPage({ code, isSpectator = false, onGameReset }: LudoLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<Game | null>(null)
    const [gameEngine, setGameEngine] = useState<LudoGame | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
    const [isRematchSubmitting, setIsRematchSubmitting] = useState(false)
    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(code, 'Ludo')
    // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
    useLobbyHeartbeat(code, !isSpectator)
    const isMoveSubmittingRef = React.useRef(false)
    const freshnessRef = React.useRef(createFreshnessWatermark())
    const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())
    const lifecycleRedirectInFlightRef = React.useRef(false)
    const activeGameIdRef = React.useRef<string | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'ludo').minPlayersRequired

    const [mobileTab, setMobileTab] = useState<'board' | 'history' | 'rules' | 'chat'>('board')
    const [overlayInspecting, setOverlayInspecting] = useState(false)

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
                source: 'ludo_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'ludo',
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
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'ludo-lifecycle-redirect' })
        clientLogger.warn('Ludo lifecycle redirect triggered', { code, reason, target: '/games' })
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
            const authoritativeEngine = new LudoGame(gameId)
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
                const engine = new LudoGame(activeGame.id)
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
            showToast.errorFrom(error, 'games.ludo.game.loadFailed')
            setLoading(false)
        }
    }, [code, router])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({ gameStatus: game?.status, lobbyIsActive: lobby?.isActive })
        if (redirectReason) triggerLifecycleRedirect(redirectReason)
    }, [game?.status, lobby?.isActive, triggerLifecycleRedirect])

    useEffect(() => { setOverlayInspecting(false) }, [game?.status])

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 Ludo game abandoned:', data)
        if (isLeavingLobbyRef.current) return
        void loadLobby()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobby, triggerLifecycleRedirect, isLeavingLobbyRef])

    const handlePlayerLeft = useCallback((data: {
        userId: string; username?: string; playerName?: string; remainingPlayers?: number;
        nextCreatorId?: string; nextCreatorName?: string; gameTerminal?: boolean;
    }) => {
        clientLogger.log('📡 Ludo player left:', data)
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

    // Play again (the shared /api/game/create rematch) starts a new game row in
    // the same lobby with the same players; everyone reloads onto it.
    const handleGameStarted = useCallback(() => {
        resetFreshnessWatermark(freshnessRef.current)
        void loadLobby()
    }, [loadLobby])

    const { isConnected, isReconnecting } = useRealtimeConnection({
        // #987: Supabase Broadcast has no replay buffer; resync after a gap.
        onStateSync: async () => { await loadLobby() },
        code,
        shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken) || isSpectator),
        onGameUpdate: handleGameUpdate,
        onGameStarted: handleGameStarted,
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
        const submitStartedAt = Date.now()
        let responseStatus: number | undefined
        try {
            const userId = getCurrentUserId()
            if (!userId) return false
            const optimisticEngine = new LudoGame(game.id)
            optimisticEngine.restoreState(gameEngine.getState())
            if (!optimisticEngine.validateMove(move)) {
                if (!isAutoAction) showToast.error('errors.invalidActionData')
                return false
            }
            isMoveSubmittingRef.current = true
            setIsMoveSubmitting(true)
            // Only a token move is shown before the server answers. A roll is
            // never simulated here: the die is the server's, and a local number
            // that the server then replaced would look exactly like cheating.
            if (move.type === 'move' && !isAutoAction) {
                optimisticEngine.makeMove(move)
                const optimisticState = optimisticEngine.getState()
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
                body: JSON.stringify({ gameId: game.id, move, userId, autoActionContext: options?.autoActionContext }),
            })
            responseStatus = res.status
            const data = await res.json().catch(() => null)
            if (isAutoAction && isExpectedAutoActionSkip(res.status, data)) return false
            if (!res.ok) {
                trackMoveSubmitApplied({ gameType: 'ludo', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, isAutoAction, source: 'ludo_page' })
                clientLogger.error('Move failed:', data?.error)
                if (!isAutoAction) showToast.error('games.ludo.game.moveFailed')
                await loadLobby()
                return false
            }
            const authoritativeState = data?.game?.state
            if (authoritativeState && !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status, { trusted: true })) await loadLobby()
            trackMoveSubmitApplied({ gameType: 'ludo', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: true, applied: true, statusCode: responseStatus, isAutoAction, source: 'ludo_page' })
            if (move.type === 'timeout') showToast.info('games.ludo.game.timeoutMoved')
            if (authoritativeState && typeof authoritativeState === 'object') {
                const resolved = new LudoGame(game.id)
                resolved.restoreState(authoritativeState as AnyGameState)
                const winner = resolved.checkWinCondition()
                if (winner && winner.id === userId) sounds.play('win')
            }
            return true
        } catch (error) {
            trackMoveSubmitApplied({ gameType: 'ludo', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, isAutoAction, source: 'ludo_page' })
            clientLogger.error('Error making move:', error)
            if (!isAutoAction) showToast.errorFrom(error, 'games.ludo.game.moveFailed')
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
            : 30

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
                // Fail-safe: a stuck bot turn gets a nudge. Safe with the server's locks.
                if (gameEngine && game && Array.isArray(game.players)) {
                    const currentPlayer = gameEngine.getCurrentPlayer()
                    const currentGamePlayer = currentPlayer
                        ? game.players.find((p) => p.userId === currentPlayer.id)
                        : null
                    const isBotTurn = !!(currentGamePlayer?.user?.bot || currentGamePlayer?.bot)
                    if (isBotTurn && currentPlayer?.id) {
                        void triggerBotTurn(currentPlayer.id, game.id)
                        return false
                    }
                }
                // #989: an absent player's clock can only be ended by the server
                // noticing they are gone; ask it, throttled.
                const decision = stuckTurnRecoveryRef.current.decide(
                    turnSignatureOf(timerState?.currentPlayerIndex, timerState?.lastMoveAt),
                    Date.now()
                )
                if (decision === 'give-up') return true
                if (decision === 'resync') void loadLobby()
                return false
            }
            const userId = getCurrentUserId()
            if (!userId) return false
            const autoActionContext = buildAutoActionContext(userId)
            if (!autoActionContext) return false
            // The server rolls and moves for an idle player and passes the turn.
            return handleMove(
                { playerId: userId, type: 'timeout', data: {}, timestamp: new Date() },
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
        if (!lobby || !game) { router.push(`/lobby/${code}`); return }
        const userId = getCurrentUserId()
        if (!userId) { router.push(`/lobby/${code}`); return }
        if (lobby.creatorId !== userId) { showToast.info('game.ui.waitingForHost'); return }
        setIsRematchSubmitting(true)
        try {
            // The shared rematch: same lobby, same seats, a fresh game row.
            const response = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameType: 'ludo', lobbyId: lobby.id }),
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error((typeof data?.details === 'string' && data.details) || (typeof data?.error === 'string' && data.error) || 'Failed to start rematch')
            resetFreshnessWatermark(freshnessRef.current)
            await loadLobby()
            showToast.success('games.ludo.game.newGameStarted')
        } catch (error) {
            clientLogger.error('Failed to start Ludo rematch:', error)
            showToast.errorFrom(error, 'games.ludo.game.moveFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, game, getCurrentUserId, lobby, loadLobby, router])

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
            showToast.errorFrom(error, 'games.ludo.game.moveFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, getCurrentUserId, lobby, onGameReset, router])

    // Hoisted above the early returns so the hook always runs.
    // The board's token list, memoised on the engine (a new engine per state) and
    // the few things that decide what is tappable. Hoisted with the other hooks.
    const boardUserId = getCurrentUserId()
    const canPickToken =
        !isSpectator &&
        !isMoveSubmitting &&
        !!gameEngine &&
        gameEngine.getState().status === 'playing' &&
        gameEngine.getCurrentPlayer()?.id === boardUserId &&
        gameEngine.getPhase() === 'move'
    const boardTokens = useMemo<BoardToken[]>(() => {
        if (!gameEngine) return []
        const data = gameEngine.getData()
        return data.seats.flatMap((seat) =>
            (data.tokens[seat.playerId] ?? []).map((position, token) => ({
                playerId: seat.playerId,
                color: seat.color,
                token,
                position,
                isMine: seat.playerId === boardUserId,
                selectable: canPickToken && seat.playerId === boardUserId && data.legalTokens.includes(token),
            }))
        )
    }, [gameEngine, boardUserId, canPickToken])

    const earlyEvents = gameEngine ? gameEngine.getData().events : undefined
    const reversedEvents = useMemo(
        () => (Array.isArray(earlyEvents) ? earlyEvents.slice().reverse() : []),
        [earlyEvents]
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
                    <h1 className="text-2xl font-bold mb-4">{t('games.ludo.game.lobbyNotFoundTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.ludo.game.lobbyNotFoundDescription')}</p>
                    <button onClick={() => router.push('/games')} className="btn btn-primary">{t('games.ludo.game.backToGames')}</button>
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
                    <h1 className="text-2xl font-bold mb-4">{t('games.ludo.game.gameNotStartedTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.ludo.game.gameNotStartedDescription')}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => router.push('/games/ludo/lobbies')} className="btn btn-primary">{t('games.ludo.game.backToLobbies')}</button>
                        <button onClick={() => router.push('/games')} className="btn btn-secondary">{t('games.ludo.game.backToGames')}</button>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    const state = gameEngine.getState()
    const data = gameEngine.getData()
    const lobbyPlayers = game?.players || []
    const currentUserId = getCurrentUserId()
    const currentPlayer = gameEngine.getCurrentPlayer()
    const phase = gameEngine.getPhase()
    const myTurn = !isSpectator && isMyTurn() && !isFinished

    const lobbyPlayerOf = (playerId: string) => lobbyPlayers.find((p) => p.userId === playerId)
    const isBotPlayer = (playerId: string) => {
        const lp = lobbyPlayerOf(playerId)
        return !!(lp?.user?.bot || lp?.bot)
    }
    const getDisplayName = (playerId: string) => {
        const lp = lobbyPlayerOf(playerId)
        return lp?.user?.username || lp?.name || state.players.find((p) => p.id === playerId)?.name || t('games.ludo.game.unknownPlayer')
    }
    const getAvatar = (playerId: string): string | null => {
        const lp = lobbyPlayerOf(playerId)
        return lp?.user?.avatarUrl ?? lp?.user?.image ?? null
    }
    const getIsPremium = (playerId: string) => !!(lobbyPlayerOf(playerId)?.user as { isPremium?: boolean } | undefined)?.isPremium
    const colorOf = (playerId: string): LudoColor => gameEngine.getColor(playerId) ?? 'red'
    const colorName = (color: LudoColor) => t(`games.ludo.colors.${color}`)

    const winnerId = data.winnerId
    const winnerName = winnerId ? getDisplayName(winnerId) : null
    const currentColor = currentPlayer ? colorOf(currentPlayer.id) : 'red'
    const currentName = currentPlayer ? getDisplayName(currentPlayer.id) : ''

    const lastMovedKey = data.lastMove ? `${data.lastMove.playerId}-${data.lastMove.token}` : null

    const handleRoll = async () => {
        const userId = getCurrentUserId()
        if (!userId || !myTurn || phase !== 'roll' || isMoveSubmitting) return
        await handleMove({ playerId: userId, type: 'roll', data: {}, timestamp: new Date() })
    }

    const handleTokenClick = async (token: number) => {
        const userId = getCurrentUserId()
        if (!userId || !myTurn || phase !== 'move' || isMoveSubmitting) return
        await handleMove({ playerId: userId, type: 'move', data: { token }, timestamp: new Date() })
    }

    const tokenLabel = (token: BoardToken) => t('games.ludo.game.tokenLabel', {
        color: colorName(token.color),
        number: token.token + 1,
    })

    const homeLine = (playerId: string) => t('games.ludo.game.tokensHome', {
        home: gameEngine.tokensHome(playerId),
        total: data.tokensPerPlayer,
    })
    const sublineFor = (playerId: string) => isBotPlayer(playerId)
        ? `${t('game.ui.botBadge')} · ${homeLine(playerId)}`
        : homeLine(playerId)

    const renderPlayerCard = (playerId: string, side: 'left' | 'right') => {
        const color = colorOf(playerId)
        return (
            <GamePlayerCard
                name={getDisplayName(playerId)}
                isActive={!isFinished && currentPlayer?.id === playerId}
                isMe={playerId === currentUserId}
                isWinner={!!winnerId && winnerId === playerId}
                side={side}
                avatarSrc={getAvatar(playerId)}
                isPremium={getIsPremium(playerId)}
                accentColor={COLOR_FILL[color]}
                subline={sublineFor(playerId)}
                cornerBadge={
                    <span style={{ position: 'absolute', bottom: -3, right: -3, display: 'inline-flex' }}>
                        <TokenDot color={color} size={18} />
                    </span>
                }
            />
        )
    }

    // ─── Sections ─────────────────────────────────────────────────────────────

    const lastRollValue = data.lastRoll?.value ?? null
    const lastRollColor = data.lastRoll ? COLOR_FILL[colorOf(data.lastRoll.playerId)] : 'var(--bd-ink)'
    const dieLabel = lastRollValue !== null
        ? t('games.ludo.game.lastRollLabel', { player: data.lastRoll ? getDisplayName(data.lastRoll.playerId) : '', value: lastRollValue })
        : t('games.ludo.game.noRollYet')

    const twoPlayers = state.players.length === 2
    const headerSection = (
        <div className="ttt-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(255,196,77,0.10) 100%)', padding: '12px 16px', overflow: 'hidden' }}>
            {twoPlayers ? (
                <GameScoreboardHeader
                    leftCard={renderPlayerCard(state.players[0].id, 'left')}
                    center={
                        <>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                                <GameIcon gameId="ludo" accentColor="var(--bd-sun)" size={18} />
                            </div>
                            <ScorePop value={`${gameEngine.tokensHome(state.players[0].id)}:${gameEngine.tokensHome(state.players[1].id)}`} style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                                {gameEngine.tokensHome(state.players[0].id)}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{gameEngine.tokensHome(state.players[1].id)}
                            </ScorePop>
                            <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                                {t('games.ludo.game.homeLabel')}
                            </div>
                        </>
                    }
                    centerCompact={
                        <ScorePop value={`${gameEngine.tokensHome(state.players[0].id)}:${gameEngine.tokensHome(state.players[1].id)}`} style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
                            {gameEngine.tokensHome(state.players[0].id)}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>:</span>{gameEngine.tokensHome(state.players[1].id)}
                        </ScorePop>
                    }
                    rightCard={renderPlayerCard(state.players[1].id, 'right')}
                />
            ) : (
                <div className="ludo-player-grid">
                    {state.players.map((player, index) => (
                        <React.Fragment key={player.id}>{renderPlayerCard(player.id, index % 2 === 0 ? 'left' : 'right')}</React.Fragment>
                    ))}
                </div>
            )}
        </div>
    )

    const statusTitle = isFinished
        ? ''
        : myTurn
            ? phase === 'move'
                ? t('games.ludo.game.pickToken', { value: data.dice ?? 0 })
                : t('games.ludo.game.yourRoll')
            : t('games.ludo.game.playerTurn', { player: currentName })

    const statusSection = (
        <GameStatusBanner
            isFinished={isFinished}
            finishedMessage={winnerName ? t('games.ludo.game.playerWins', { player: winnerName }) : t('game.ui.gameFinished')}
            activeTitle={statusTitle}
            meta={colorName(currentColor)}
            secs={timeLeft}
            turnTimerLimit={turnTimerLimit}
            isYourTurn={myTurn}
            barColor={COLOR_FILL[currentColor]}
            leadingIcon={<TokenDot color={currentColor} size={24} />}
            isSpectator={isSpectator}
        />
    )

    const hasMultipleHumans = lobbyPlayers.filter((p) => !p.user?.bot && !p.bot).length >= 2
    const showChat = hasMultipleHumans || isSpectator

    const eventText = (event: LudoEvent) => {
        const victims = (event.capturedPlayerIds ?? []).map(getDisplayName).join(', ')
        switch (event.kind) {
            case 'enter': return t('games.ludo.game.events.enter', { number: (event.token ?? 0) + 1 })
            case 'capture': return t('games.ludo.game.events.capture', { number: (event.token ?? 0) + 1, victims })
            case 'home': return t('games.ludo.game.events.home', { number: (event.token ?? 0) + 1 })
            case 'no-move': return t('games.ludo.game.events.noMove')
            case 'triple-six': return t('games.ludo.game.events.tripleSix')
            default: return t('games.ludo.game.events.move', { number: (event.token ?? 0) + 1 })
        }
    }

    // Every player's last rolls, so anyone can see the die is not playing favourites.
    const rollStrip = (
        <div className="ludo-roll-strip" data-testid="ludo-roll-history">
            {state.players.map((player) => {
                const rolls = data.rollHistory[player.id] ?? []
                return (
                    <div key={player.id} className="ludo-roll-row">
                        <TokenDot color={colorOf(player.id)} size={12} />
                        <span className="ludo-roll-name">{getDisplayName(player.id)}</span>
                        <span className="ludo-roll-values" aria-label={t('games.ludo.game.recentRolls', { player: getDisplayName(player.id) })}>
                            {rolls.length === 0
                                ? <span style={{ color: 'var(--bd-ink-muted)' }}>–</span>
                                : rolls.slice(-6).map((value, index) => (
                                    <span key={index} className={`ludo-roll-chip${value === 6 ? ' ludo-roll-chip--six' : ''}`}>{value}</span>
                                ))}
                        </span>
                    </div>
                )
            })}
            <p className="ludo-roll-note">{t('games.ludo.game.serverRollsNote')}</p>
        </div>
    )

    const historySection = (
        // Never `--fill`: the column's second row always holds something – chat,
        // or the rules when chat is hidden in a bot game.
        <div className="ttt-history-card ludo-history-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('games.ludo.game.rollsTitle')}</h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {data.eventCount}
                </span>
            </div>
            {rollStrip}
            <div className="ttt-history-list">
                {reversedEvents.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.ludo.game.noMovesYet')}</div>
                    : reversedEvents.map((event: LudoEvent) => (
                        <div key={event.n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bd-card-warm)' }}>
                            <span style={{ color: 'var(--bd-ink-muted)', width: 26, fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>
                                #{String(event.n).padStart(2, '0')}
                            </span>
                            <TokenDot color={colorOf(event.playerId)} size={14} />
                            <span style={{ color: 'var(--bd-ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                                <strong style={{ color: 'var(--bd-ink)' }}>{getDisplayName(event.playerId)}</strong>{' '}{eventText(event)}
                            </span>
                            <span className="ludo-roll-chip" title={t('games.ludo.game.rolledValue', { value: event.roll })}>{event.roll}</span>
                        </div>
                    ))
                }
            </div>
        </div>
    )

    const rulesSection = (
        <div className="ttt-history-card ludo-rules-card">
            <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('games.ludo.game.rulesTitle')}</h3>
            </div>
            <ul className="ttt-history-list ludo-rules-list">
                <li>{t('games.ludo.rules.serverRolls')}</li>
                <li>{t('games.ludo.rules.sixToLeave')}</li>
                <li>{t('games.ludo.rules.sixRollsAgain')}</li>
                <li>{t('games.ludo.rules.capture')}</li>
                <li>{t('games.ludo.rules.safeSquares')}</li>
                <li>{t('games.ludo.rules.exactHome')}</li>
                <li>{t('games.ludo.rules.winner')}</li>
                <li>{t('games.ludo.rules.timer')}</li>
            </ul>
        </div>
    )

    const showsResultOverlay = isFinished && !isSpectator && !overlayInspecting
    const isHost = !!lobby && lobby.creatorId === currentUserId

    const renderBoardSection = () => (
        <div className={`ttt-board-card${showsResultOverlay ? ' ttt-board-card--result' : ''}`} style={{ position: 'relative' }}>
            <div className="ttt-board-surface ludo-board-surface">
                <LudoBoard
                    tokens={boardTokens}
                    activeColors={data.seats.map((seat) => seat.color)}
                    onTokenClick={(token) => void handleTokenClick(token)}
                    lastMovedKey={lastMovedKey}
                    tokenLabel={tokenLabel}
                    boardLabel={t('games.ludo.game.boardLabel')}
                />
                {isFinished && !isSpectator && overlayInspecting && (
                    <button
                        data-testid="show-results-pill"
                        onClick={() => setOverlayInspecting(false)}
                        style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(31,27,22,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}
                    >
                        {t('games.ludo.game.showResults')}
                    </button>
                )}
            </div>
            {showsResultOverlay && (
                <GameResultOverlay
                    title={winnerName ? t('games.ludo.game.playerWins', { player: winnerName }) : t('game.ui.gameFinished')}
                    kicker={winnerId === currentUserId ? t('games.ludo.game.youWon') : undefined}
                    accentColor="var(--bd-sun)"
                    accentShadowColor="rgba(0,0,0,0.25)"
                    onInspect={() => setOverlayInspecting(true)}
                    isHost={isHost}
                    isLoading={isRematchSubmitting}
                    onPlayAgain={handlePlayAgain}
                    onReturnToLobby={handleReturnToWaiting}
                    onLeave={() => setShowLeaveConfirmModal(true)}
                    isGuest={isGuest}
                    registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
                    inviteCode={code}
                    gameType="ludo"
                    isRegistered={status === 'authenticated' && !isGuest}
                />
            )}
        </div>
    )

    const canRoll = myTurn && phase === 'roll' && !isMoveSubmitting
    // The die and the Roll button: the one control row the game needs. For a
    // spectator or an opponent it still shows the die, so the row is never empty.
    const actionsSection = (
        <div className="ludo-actions">
            <DieFace
                value={lastRollValue}
                size={44}
                color={lastRollColor}
                rollKey={data.lastRoll?.at}
                label={dieLabel}
            />
            <div className="ludo-actions__text">
                <span className="ludo-actions__title">{dieLabel}</span>
                <span className="ludo-actions__hint">
                    {isFinished
                        ? (winnerName ? t('games.ludo.game.playerWins', { player: winnerName }) : t('game.ui.gameFinished'))
                        : myTurn && phase === 'move'
                        ? t('games.ludo.game.tapHighlighted')
                        : myTurn
                            ? t('games.ludo.game.rollHint')
                            : t('games.ludo.game.waitingFor', { player: currentName })}
                </span>
            </div>
            {!isSpectator && !isFinished && (
                <button
                    type="button"
                    className="ludo-roll-button"
                    onClick={() => void handleRoll()}
                    disabled={!canRoll}
                    data-testid="ludo-roll-button"
                >
                    {isMoveSubmitting && myTurn ? t('games.ludo.game.rolling') : t('games.ludo.game.roll')}
                </button>
            )}
        </div>
    )

    const chatPlayerProfiles = (() => {
        const map = new Map<string, { avatarUrl?: string | null; isPremium?: boolean }>()
        for (const p of lobbyPlayers) {
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

    const roomCardProps = {
        gameId: 'ludo',
        title: t('games.ludo.name'),
        code,
        isSpectator,
        leaveLabel: t('game.ui.leave'),
        allowSpectators: !!lobby.allowSpectators,
        onLeave: () => setShowLeaveConfirmModal(true),
    }
    const roomSection = <GameRoomCard {...roomCardProps} />
    const roomSectionCompact = <GameRoomCard {...roomCardProps} compact />

    return (
        <div className="game-screen ttt-screen ludo-screen" style={themeStyle}>
            {/* ── DESKTOP ─────────────────────────────────────────────────── */}
            <div className="ttt-desktop-layout">
                <div className="ttt-grid">
                    {headerSection}
                    {roomSection}
                    <div className="ttt-center-col">
                        {statusSection}
                        {renderBoardSection()}
                        {actionsSection}
                    </div>
                    <div className="ttt-right-col">
                        {historySection}
                        {chatSection ?? rulesSection}
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
                    {actionsSection}
                    {chatSection}
                </div>
            </div>

            {/* ── MOBILE ──────────────────────────────────────────────────── */}
            <div className="ttt-mobile-layout">
                <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                {statusSection}
                <GameTabs
                    tabs={[
                        { id: 'board' as const, label: t('game.ui.tabBoard') },
                        { id: 'history' as const, label: `${t('game.ui.tabMoves')} (${data.eventCount})` },
                        { id: 'rules' as const, label: t('games.ludo.game.rulesTab') },
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
                    {mobileTab === 'rules' && rulesSection}
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
