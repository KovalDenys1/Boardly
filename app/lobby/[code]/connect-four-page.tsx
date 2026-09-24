'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
    ConnectFourGame,
    ConnectFourGameData,
    ConnectFourMoveRecord,
    ConnectFourPendingRequest,
    PlayerDisc,
    ROWS,
    COLS,
} from '@/lib/games/connect-four-game'
import { clientLogger } from '@/lib/client-logger'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { AnyGameState, Game, GameUpdatePayload, type ChatMessagePayload } from '@/types/game'
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
import { useTurnSounds } from '@/hooks/useTurnSounds'
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


// ─── Design sub-components ────────────────────────────────────────────────────

const DISC_RED = 'var(--bd-coral)'
const DISC_YELLOW = 'var(--bd-sun)'
// Fixed (not var(--bd-bg2)) — the board is a self-contained "black plastic
// with pale holes" look that must stay the same in light and dark theme.
// --bd-bg2 flips to a dark color in html.dark, which inverted this into a
// light frame with near-black holes on real devices. Matches --bd-bg2's
// light-mode value exactly, so light mode is visually unchanged.
const DISC_EMPTY = '#F2E9D8'

function C4Disc({ disc, isWin, pop, ghost, ghostDisc, fallDistancePx }: {
    disc: PlayerDisc | null; isWin?: boolean; pop?: boolean; ghost?: boolean; ghostDisc?: PlayerDisc; fallDistancePx?: number
}) {
    if (ghost) {
        const fill = ghostDisc === 1 ? DISC_RED : DISC_YELLOW
        return (
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: fill, position: 'relative' }}>
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeDasharray="4.5 3" strokeLinecap="round" />
                </svg>
            </div>
        )
    }
    const color = disc === 1 ? DISC_RED : disc === 2 ? DISC_YELLOW : DISC_EMPTY
    const shadow = disc === 1 ? '0 2px 6px rgba(255,107,91,0.45)' : disc === 2 ? '0 2px 6px rgba(255,196,77,0.45)' : 'none'
    const isAnimating = pop && !!fallDistancePx

    if (isAnimating) {
        const durationMs = 240 + Math.round(fallDistancePx! * 0.9)
        return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {/* Keep the empty hole visible while disc is in flight */}
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: DISC_EMPTY }} />
                {/* Falling disc, animated from above */}
                <div style={{
                    position: 'absolute', inset: 0,
                    borderRadius: '50%',
                    background: color,
                    boxShadow: isWin ? `0 0 0 3px white, ${shadow}` : shadow,
                    animation: `c4-drop ${durationMs}ms linear both`,
                    '--c4-fall-dist': `${fallDistancePx}px`,
                    '--c4-end-scale': isWin ? '1.12' : '1',
                } as React.CSSProperties} />
            </div>
        )
    }

    return (
        <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: color,
            boxShadow: isWin ? `0 0 0 3px white, ${shadow}` : shadow,
            transform: isWin ? 'scale(1.12)' : 'scale(1)',
            transition: 'transform 0.15s, box-shadow 0.15s',
        }} />
    )
}

function C4Board({ board, winningLine, hoverCol, onColHover, onColClick, disabled, currentDisc, lastDroppedRow, lastDroppedCol }: {
    board: (PlayerDisc | null)[][]
    winningLine: [number, number][] | null
    hoverCol: number | null
    onColHover: (col: number | null) => void
    onColClick: (col: number) => void
    disabled: boolean
    currentDisc: PlayerDisc
    lastDroppedRow: number | null
    lastDroppedCol: number | null
}) {
    const isWin = (r: number, c: number) => winningLine?.some(([wr, wc]) => wr === r && wc === c) ?? false
    const cellRef = useRef<HTMLButtonElement>(null)

    const getDropRow = (col: number): number | null => {
        if (board[0]?.[col] !== null) return null
        for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r]?.[col] === null) return r
        }
        return null
    }
    const ghostRow = hoverCol !== null && !disabled ? getDropRow(hoverCol) : null

    const getFallDistancePx = (targetRow: number): number => {
        const cellH = cellRef.current?.getBoundingClientRect().height ?? 46
        return (targetRow + 1) * (cellH + 6)
    }

    return (
        <div style={{ position: 'relative', userSelect: 'none' }}>
            {/* Drop indicator arrows */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, marginBottom: 4, gap: 3 }}>
                {Array.from({ length: COLS }, (_, c) => (
                    <div key={c} style={{
                        height: 20, display: 'grid', placeItems: 'center',
                        opacity: hoverCol === c && !disabled && board[0]?.[c] === null ? 1 : 0,
                        transition: 'opacity 0.12s',
                    }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 1v9M3 7l4 5 4-5" stroke={currentDisc === 1 ? DISC_RED : DISC_YELLOW} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                ))}
            </div>

            {/* Board grid — fixed dark frame (not var(--bd-ink), which
                flips to a light color in html.dark) so the board keeps its
                self-contained look in both themes; see DISC_EMPTY above. */}
            <div style={{
                background: '#1F1B16',
                borderRadius: 16,
                padding: 8,
                boxShadow: '0 8px 24px rgba(31,27,22,0.24)',
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                gap: 6,
                overflow: 'hidden',
            }}>
                {Array.from({ length: ROWS }, (_, r) =>
                    Array.from({ length: COLS }, (_, c) => {
                        const cell = board[r]?.[c] ?? null
                        const win = isWin(r, c)
                        const colFull = board[0]?.[c] !== null
                        const isHoveredCol = hoverCol === c && !disabled && !colFull
                        const isGhost = isHoveredCol && r === ghostRow && !cell
                        const hoverTint = currentDisc === 1 ? 'rgba(255,107,91,0.28)' : 'rgba(255,196,77,0.28)'
                        const isLastDropped = !!cell && r === lastDroppedRow && c === lastDroppedCol
                        const fallDistancePx = isLastDropped && lastDroppedRow !== null
                            ? getFallDistancePx(lastDroppedRow)
                            : undefined
                        return (
                            <button
                                key={`${r}-${c}`}
                                ref={r === 0 && c === 0 ? cellRef : undefined}
                                onClick={() => !colFull && !disabled && onColClick(c)}
                                onMouseEnter={() => !disabled && !colFull && onColHover(c)}
                                onMouseLeave={() => onColHover(null)}
                                disabled={disabled || colFull}
                                aria-label={`column ${c + 1}`}
                                style={{
                                    width: 'var(--c4-cell, 44px)',
                                    height: 'var(--c4-cell, 44px)',
                                    borderRadius: '50%',
                                    padding: 3,
                                    background: isHoveredCol && !cell ? hoverTint : 'rgba(255,255,255,0.10)',
                                    transition: 'background 0.1s',
                                    border: 'none',
                                    cursor: disabled || colFull ? 'not-allowed' : 'pointer',
                                    outline: 'none',
                                    display: 'grid',
                                    placeItems: 'center',
                                    overflow: 'visible',
                                }}
                            >
                                <C4Disc
                                    disc={cell}
                                    isWin={win}
                                    pop={isLastDropped}
                                    fallDistancePx={fallDistancePx}
                                    ghost={isGhost}
                                    ghostDisc={isGhost ? currentDisc : undefined}
                                />
                            </button>
                        )
                    })
                )}
            </div>

            {/* Column click zones (overlay on entire column for easier clicking) */}
            <div style={{
                position: 'absolute', inset: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                pointerEvents: disabled ? 'none' : 'auto',
            }}>
                {Array.from({ length: COLS }, (_, c) => {
                    const colFull = board[0]?.[c] !== null
                    return (
                        <div
                            key={c}
                            onClick={() => !colFull && onColClick(c)}
                            onMouseEnter={() => !colFull && onColHover(c)}
                            onMouseLeave={() => onColHover(null)}
                            style={{ cursor: colFull ? 'not-allowed' : 'pointer' }}
                        />
                    )
                })}
            </div>
        </div>
    )
}

function C4DiscBadge({ disc }: { disc: PlayerDisc }) {
    return (
        <div style={{
            position: 'absolute', bottom: -3, right: -3, width: 20, height: 20,
            borderRadius: '50%', background: disc === 1 ? DISC_RED : DISC_YELLOW,
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

interface ConnectFourLobbyPageProps {
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

export default function ConnectFourLobbyPage({ code, isSpectator = false, onGameReset }: ConnectFourLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<Game | null>(null)
    const [gameEngine, setGameEngine] = useState<ConnectFourGame | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
    const [isRematchSubmitting, setIsRematchSubmitting] = useState(false)
    const [hoverCol, setHoverCol] = useState<number | null>(null)
    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(code, 'Connect Four')
    // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
    useLobbyHeartbeat(code, !isSpectator)
    const isMoveSubmittingRef = React.useRef(false)
    const freshnessRef = React.useRef(createFreshnessWatermark())
    const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())
    const lifecycleRedirectInFlightRef = React.useRef(false)
    const activeGameIdRef = React.useRef<string | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'connect_four').minPlayersRequired

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
                source: 'connect_four_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'connect_four',
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
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'c4-lifecycle-redirect' })
        clientLogger.warn('Connect Four lifecycle redirect triggered', { code, reason, target: '/games' })
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
            // #985: refuse a snapshot older than the one on screen, so a stale
            // broadcast cannot overwrite the optimistic move and flicker it.
            const freshness = decideFreshness(freshnessRef.current, authoritativeState, {
                trusted: options?.trusted,
                moveInFlight: isMoveSubmittingRef.current,
            })
            if (!freshness.accept) {
                clientLogger.debug('Ignoring stale game state', { gameId, reason: freshness.reason })
                return true
            }
            if (!authoritativeState || typeof authoritativeState !== 'object') return false
            const authoritativeEngine = new ConnectFourGame(gameId)
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
                const engine = new ConnectFourGame(activeGame.id)
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
            showToast.errorFrom(error, 'games.connect_four.game.loadFailed')
            setLoading(false)
        }
    }, [code, router])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({ gameStatus: game?.status, lobbyIsActive: lobby?.isActive })
        if (redirectReason) triggerLifecycleRedirect(redirectReason)
    }, [game?.status, lobby?.isActive, triggerLifecycleRedirect])

    useEffect(() => { setOverlayInspecting(false) }, [game?.status])

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 Connect Four game abandoned:', data)
        if (isLeavingLobbyRef.current) return
        void loadLobby()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobby, triggerLifecycleRedirect, isLeavingLobbyRef])

    const handlePlayerLeft = useCallback((data: {
        userId: string; username?: string; playerName?: string; remainingPlayers?: number;
        nextCreatorId?: string; nextCreatorName?: string; gameTerminal?: boolean;
    }) => {
        clientLogger.log('📡 Connect Four player left:', data)
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
            const optimisticEngine = new ConnectFourGame(game.id)
            optimisticEngine.restoreState(gameEngine.getState())
            if (!optimisticEngine.validateMove(move)) {
                if (!isAutoAction) showToast.error('errors.invalidActionData')
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
            if (isAutoAction && isExpectedAutoActionSkip(res.status, data)) return false
            if (!res.ok) {
                trackMoveSubmitApplied({ gameType: 'connect_four', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'connect_four_page' })
                clientLogger.error('Move failed:', data?.error)
                if (!isAutoAction) showToast.error('games.connect_four.game.moveFailed', undefined, { message: (typeof data?.details === 'string' && data.details) || (typeof data?.error === 'string' && data.error) || 'Failed to submit move' })
                await loadLobby()
                return false
            }
            const authoritativeState = data?.game?.state
            if (authoritativeState && !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status, { trusted: true })) await loadLobby()
            trackMoveSubmitApplied({ gameType: 'connect_four', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: true, applied: true, statusCode: responseStatus, source: 'connect_four_page' })
            if (move.type === 'request-undo') {
                if (data?.autoResponse?.type === 'undo') {
                    showToast.infoText(data.autoResponse.accepted ? 'Undo request accepted.' : 'Undo request declined.')
                } else {
                    showToast.infoText('Undo request sent.')
                }
            } else if (move.type === 'respond-undo') {
                showToast.infoText(move.data.accept === true ? 'Undo accepted.' : 'Undo declined.')
            } else if (move.type === 'timeout-forfeit') {
                showToast.infoText('Time expired. Round forfeited.')
            }
            const resolvedEngine = isAutoAction
                ? (() => {
                    if (!authoritativeState || typeof authoritativeState !== 'object') return null
                    const ae = new ConnectFourGame(game.id)
                    ae.restoreState(authoritativeState as AnyGameState)
                    return ae
                })()
                : optimisticEngine
            const winner = resolvedEngine?.checkWinCondition()
            if (winner || resolvedEngine?.getState().status === 'finished') {
                if (winner) {
                    showToast.success('games.connect_four.game.gameWon')
                    if (winner.id === getCurrentUserId()) sounds.play('win')
                } else showToast.info('game.ui.gameFinished')
            }
            return true
        } catch (error) {
            trackMoveSubmitApplied({ gameType: 'connect_four', moveType: move.type, durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'connect_four_page' })
            clientLogger.error('Error making move:', error)
            if (!isAutoAction) showToast.errorFrom(error, 'games.connect_four.game.moveFailed')
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
        // An undo prompt used to pass null here, which stopped the hook from
        // ever firing a timeout while leaving the countdown visibly running down
        // to zero. With no clock and no legal move the board was frozen for as
        // long as the opponent ignored the prompt (#997).
        gameState: timerState,
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
                        clientLogger.warn('⏰ Connect Four timer expired on bot turn, triggering fallback bot action', {
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
            if (!userId) return false
            const autoActionContext = buildAutoActionContext(userId)
            if (!autoActionContext) return false
            clientLogger.warn('⏰ Connect Four turn timer expired, forfeiting round', { code, gameId: game.id, userId })
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
            // Try next-round in the same game first
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
            // next-round failed (e.g., game already cleaned up) — start fresh game
            const isCreator = lobby.creatorId === userId
            if (!isCreator) { showToast.info('game.ui.waitingForHost'); return }
            const newGameResponse = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameType: 'connect_four', lobbyId: lobby.id }),
            })
            const newGameData = await newGameResponse.json().catch(() => null)
            if (!newGameResponse.ok) throw new Error((typeof newGameData?.details === 'string' && newGameData.details) || 'Failed to start rematch')
            await loadLobby()
            showToast.success('games.connect_four.game.playAgain')
        } catch (error) {
            clientLogger.error('Failed to start Connect Four rematch:', error)
            showToast.errorFrom(error, 'games.connect_four.game.moveFailed')
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
            showToast.errorFrom(error, 'games.connect_four.game.moveFailed')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, getCurrentUserId, lobby, onGameReset, router])

    // Hoisted above the early returns below so this hook always runs, regardless
    // of which (if any) early-return branch fires — violates Rules of Hooks otherwise.
    const earlyMoveHistory = gameEngine ? (gameEngine.getState().data as ConnectFourGameData).moveHistory : undefined
    const reversedMoveHistory = useMemo(
        () => (Array.isArray(earlyMoveHistory) ? earlyMoveHistory.slice().reverse() : []),
        [earlyMoveHistory]
    )

    // Turn and opponent-move cues (#1111); the win cue stays in handleMove.
    // Seat 0 plays disc 1, seat 1 disc 2 (the same mapping as myDisc below).
    const lastC4Move = Array.isArray(earlyMoveHistory) ? earlyMoveHistory[earlyMoveHistory.length - 1] : undefined
    const soundSeat = gameEngine ? gameEngine.getState().players.findIndex(p => p.id === getCurrentUserId()) : -1
    useTurnSounds({
        isMyTurn: isMyTurn(),
        lastMoveSignature: Array.isArray(earlyMoveHistory) ? `${earlyMoveHistory.length}:${lastC4Move?.timestamp ?? ''}` : null,
        opponentMoved: !!lastC4Move && soundSeat >= 0 && lastC4Move.disc !== soundSeat + 1,
        enabled: !isSpectator && gameEngine?.getState().status === 'playing',
    })

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
                    <h1 className="text-2xl font-bold mb-4">{t('games.connect_four.game.lobbyNotFoundTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.connect_four.game.lobbyNotFoundDescription')}</p>
                    <button onClick={() => router.push('/games')} className="btn btn-primary">{t('games.connect_four.game.backToLobbies')}</button>
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
                    <h1 className="text-2xl font-bold mb-4">{t('games.connect_four.game.gameNotStartedTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{t('games.connect_four.game.gameNotStartedDescription')}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => router.push('/games/connect-four/lobbies')} className="btn btn-primary">{t('games.connect_four.game.backToLobbies')}</button>
                        <button onClick={() => router.push('/games')} className="btn btn-secondary">{t('games.connect_four.game.backToGames')}</button>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    const state = gameEngine.getState()
    const gameData = state.data as ConnectFourGameData
    const players = game?.players || []
    const currentUserId = getCurrentUserId()

    const myPlayerIndex = state.players.findIndex(p => p.id === currentUserId)
    const myDisc: PlayerDisc | null = myPlayerIndex === 0 ? 1 : myPlayerIndex === 1 ? 2 : null

    const getDisplayName = (playerId: string) => {
        const lp = players.find(p => p.userId === playerId)
        return lp?.user?.username || lp?.name || state.players.find(p => p.id === playerId)?.name || t('games.connect_four.game.unknownPlayer')
    }

    const p1Name = state.players[0] ? getDisplayName(state.players[0].id) : 'Player 1'
    const p2Name = state.players[1] ? getDisplayName(state.players[1].id) : 'Player 2'
    const getPlayerAvatar = (userId: string): string | null => {
        const p = players.find(lp => lp.userId === userId)
        return p?.user?.avatarUrl ?? p?.user?.image ?? null
    }
    const p1Avatar = state.players[0] ? getPlayerAvatar(state.players[0].id) : null
    const p2Avatar = state.players[1] ? getPlayerAvatar(state.players[1].id) : null
    const getIsPremium = (playerId: string) => {
        const lp = players.find(p => p.userId === playerId)
        return !!(lp?.user as { isPremium?: boolean } | undefined)?.isPremium
    }
    const p1IsPremium = state.players[0] ? getIsPremium(state.players[0].id) : false
    const p2IsPremium = state.players[1] ? getIsPremium(state.players[1].id) : false

    const p1Wins = state.players[0]?.score ?? 0
    const p2Wins = state.players[1]?.score ?? 0

    const winnerDisc = gameData.winner
    const isDraw = winnerDisc === 'draw'
    const winnerName = winnerDisc && !isDraw ? (winnerDisc === 1 ? p1Name : p2Name) : null
    const isMyWin = winnerDisc !== null && winnerDisc !== 'draw' && winnerDisc === myDisc

    const pendingRequest = (gameData.pendingRequest ?? null) as ConnectFourPendingRequest | null
    const pendingRequesterName = pendingRequest ? getDisplayName(pendingRequest.requesterId) : null
    const isPendingResponder = !!pendingRequest && pendingRequest.responderId === currentUserId
    const canRequestUndo = !isMoveSubmitting && !pendingRequest && (gameData.undoSnapshots?.length ?? 0) > 0 && !isFinished
    const currentPlayerName = gameData.currentDisc === 1 ? p1Name : p2Name
    const moveHistory = Array.isArray(gameData.moveHistory) ? gameData.moveHistory : []

    const handleColClick = async (col: number) => {
        if (gameEngine.getState().status === 'finished') return
        if (!isMyTurn() || isMoveSubmitting) return
        const userId = getCurrentUserId()
        if (!userId) return
        setHoverCol(null)
        await handleMove({ playerId: userId, type: 'drop', data: { col }, timestamp: new Date() })
    }

    const handleRequestUndo = async () => {
        const userId = getCurrentUserId()
        if (!userId || !canRequestUndo) return
        await handleMove({ playerId: userId, type: 'request-undo', data: {}, timestamp: new Date() })
    }

    const handleRespondToUndo = async (accept: boolean) => {
        const userId = getCurrentUserId()
        if (!userId || !pendingRequest || pendingRequest.responderId !== userId) return
        await handleMove({ playerId: userId, type: 'respond-undo', data: { accept }, timestamp: new Date() })
    }

    // ─── Sections ─────────────────────────────────────────────────────────────

    const headerSection = (
        <div className="ttt-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(255,196,77,0.08) 100%)', padding: '12px 16px', overflow: 'hidden' }}>
            <GameScoreboardHeader
                leftCard={<GamePlayerCard name={p1Name} isActive={!isFinished && gameData.currentDisc === 1} isMe={myDisc === 1} isWinner={!isDraw && winnerDisc === 1} side="left" avatarSrc={p1Avatar} isPremium={p1IsPremium} accentColor={DISC_RED} subline={`${p1Wins}W`} cornerBadge={<C4DiscBadge disc={1} />} />}
                center={
                    <>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                            <GameIcon gameId="connect-four" accentColor={DISC_RED} size={18} />
                        </div>
                        <ScorePop value={`${p1Wins}:${p2Wins}`} style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                            {p1Wins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{p2Wins}
                        </ScorePop>
                        <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                            {t('games.connect_four.game.winsLabel')}
                        </div>
                    </>
                }
                centerCompact={
                    <ScorePop value={`${p1Wins}:${p2Wins}`} style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {p1Wins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>:</span>{p2Wins}
                    </ScorePop>
                }
                rightCard={<GamePlayerCard name={p2Name} isActive={!isFinished && gameData.currentDisc === 2} isMe={myDisc === 2} isWinner={!isDraw && winnerDisc === 2} side="right" avatarSrc={p2Avatar} isPremium={p2IsPremium} accentColor={DISC_YELLOW} subline={`${p2Wins}W`} cornerBadge={<C4DiscBadge disc={2} />} />}
            />
        </div>
    )

    const statusSection = (
        <GameStatusBanner
            isFinished={isFinished}
            isDraw={isDraw}
            finishedMessage={isDraw ? t('games.connect_four.game.draw') : t('games.connect_four.game.playerWins', { player: winnerName })}
            activeTitle={currentPlayerName}
            meta={`#${gameData.moveCount + 1}`}
            secs={timeLeft}
            turnTimerLimit={turnTimerLimit}
            isYourTurn={!isSpectator && isMyTurn()}
            barColor={gameData.currentDisc === 1 ? DISC_RED : DISC_YELLOW}
            leadingIcon={<div style={{ width: 24, height: 24, borderRadius: '50%', background: gameData.currentDisc === 1 ? DISC_RED : DISC_YELLOW, flexShrink: 0, boxShadow: '0 0 0 2px var(--bd-ink)', transition: 'background 0.2s' }} />}
            isSpectator={isSpectator}
        />
    )

    const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

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
                    {moveHistory.length}/42
                </span>
            </div>
            <div className="ttt-history-list">
                {moveHistory.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.connect_four.game.noMovesYet')}</div>
                    : reversedMoveHistory.map((m: ConnectFourMoveRecord, index) => (
                        <div key={`${m.timestamp}-${m.col}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bd-card-warm)' }}>
                            <span style={{ color: 'var(--bd-ink-muted)', width: 22, fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>
                                #{String(moveHistory.length - index).padStart(2, '0')}
                            </span>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: m.disc === 1 ? DISC_RED : DISC_YELLOW, flexShrink: 0, boxShadow: '0 0 0 1.5px var(--bd-ink)' }} />
                            <span style={{ color: 'var(--bd-ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {m.disc === 1 ? p1Name : p2Name}
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: 12, fontFamily: 'ui-monospace,monospace', fontWeight: 700, flexShrink: 0, color: 'var(--bd-ink)' }}>
                                {t('games.connect_four.game.moveColumn', { col: COLUMN_LABELS[m.col] })}
                            </span>
                        </div>
                    ))
                }
            </div>
        </div>
    )

    const requestSection = !isSpectator && pendingRequest ? (
        <div style={{
            padding: '8px 10px', borderRadius: 12, background: 'var(--bd-bg)',
            border: '1.5px solid var(--bd-line)', boxShadow: '0 3px 10px rgba(31,27,22,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
        }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bd-ink)', lineHeight: 1.35, flex: '1 1 220px' }}>
                {`${pendingRequesterName || 'Your opponent'} wants to undo the last move.`}
            </div>
            {isPendingResponder ? (
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => void handleRespondToUndo(true)} disabled={isMoveSubmitting} style={{ padding: '6px 11px', fontSize: 12, borderRadius: 12, fontWeight: 700, background: 'var(--bd-mint-deep)', color: 'white', border: 'none', cursor: isMoveSubmitting ? 'not-allowed' : 'pointer', opacity: isMoveSubmitting ? 0.65 : 1, fontFamily: 'inherit' }}>
                        {t('games.connect_four.game.undoAccept')}
                    </button>
                    <button onClick={() => void handleRespondToUndo(false)} disabled={isMoveSubmitting} style={{ padding: '6px 11px', fontSize: 12, borderRadius: 12, fontWeight: 600, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink-soft)', cursor: isMoveSubmitting ? 'not-allowed' : 'pointer', opacity: isMoveSubmitting ? 0.65 : 1, fontFamily: 'inherit' }}>
                        {t('games.connect_four.game.undoDecline')}
                    </button>
                </div>
            ) : (
                <div style={{ fontSize: 11, color: 'var(--bd-ink-muted)', whiteSpace: 'nowrap' }}>
                    {t('game.ui.waitingForResponse')}
                </div>
            )}
        </div>
    ) : null

    // The player being asked answers first; the one who asked plays on, which
    // withdraws their own request rather than leaving the board stuck (#997).
    const boardDisabled = isSpectator || !isMyTurn() || isFinished || isMoveSubmitting || isPendingResponder

    // One flag for both the class and the mount, so the card can never paint
    // without the overlay over it or - the #903 review's blocker - the overlay
    // hang over an unpainted card.
    const showsResultOverlay = isFinished && !isSpectator && !overlayInspecting

    const renderBoardSection = () => (
        <div className={`ttt-board-card${showsResultOverlay ? ' ttt-board-card--result' : ''}`} style={{ position: 'relative' }}>
            <div className="ttt-board-surface">
                <C4Board
                    board={gameData.board}
                    winningLine={gameData.winningLine}
                    hoverCol={hoverCol}
                    onColHover={setHoverCol}
                    onColClick={handleColClick}
                    disabled={boardDisabled}
                    currentDisc={gameData.currentDisc}
                    lastDroppedRow={gameData.lastDroppedRow}
                    lastDroppedCol={gameData.lastDroppedCol}
                />
                {/* Inside the surface, not beside it: this pill is
                    `position: absolute; bottom`, so it hangs off the nearest
                    positioned ancestor, and the card stopped painting in this
                    state (#903). On the card it was drawn on bare page below
                    the board. The surface is the box the player can see. */}
                {isFinished && !isSpectator && overlayInspecting && (
                    <button
                        data-testid="show-results-pill"
                        onClick={() => setOverlayInspecting(false)}
                        style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(31,27,22,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}
                    >
                        {t('games.connect_four.game.showResults')}
                    </button>
                )}
            </div>
            {isFinished && !isSpectator && (
                <>
                    {showsResultOverlay && (
                        <GameResultOverlay
                            title={isDraw ? t('games.connect_four.game.draw') : winnerName ? t('games.connect_four.game.playerWins', { player: winnerName }) : t('games.connect_four.game.gameWon')}
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
                            gameType="connect_four"
                            isRegistered={status === 'authenticated' && !isGuest}
                        />
                    )}
                </>
            )}
        </div>
    )

    // Leave and the spectator's way back live in the header (layout DoD).
    const actionsSection = isSpectator ? null : (
        <div className="flex flex-col md:flex-row gap-2">
            <button
                onClick={() => void handleRequestUndo()}
                disabled={!canRequestUndo}
                className="w-full md:w-auto"
                style={{ padding: '10px 14px', fontSize: 13, borderRadius: 14, fontWeight: 600, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: canRequestUndo ? 'var(--bd-ink-soft)' : 'var(--bd-ink-muted)', cursor: canRequestUndo ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: canRequestUndo ? 1 : 0.5 }}
            >
                ↶ {t('games.connect_four.game.requestUndo')}
            </button>
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

    const themeStyle = getThemePageStyle(lobby.theme)

    // The room card sits to the right of the scoreboard, in the same grid row
    // and at the same height (layout DoD, scheme A): game, room code, invite
    // link, and Leave. Phones get the compact form beside the scoreboard.
    const roomCardProps = {
        gameId: 'connect-four',
        title: t('games.connect_four.name'),
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
                        {renderBoardSection()}
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
                    {renderBoardSection()}
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
