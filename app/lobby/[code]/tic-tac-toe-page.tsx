'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
    TicTacToeGame,
    TicTacToeGameData,
    TicTacToeMoveRecord,
    TicTacToePendingRequest,
    PlayerSymbol,
    CellValue,
} from '@/lib/games/tic-tac-toe-game'
import { clientLogger } from '@/lib/client-logger'
import { getLobbyTheme } from '@/lib/lobby-themes'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
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
import { trackLobbyLeaveRedirect, trackMoveSubmitApplied } from '@/lib/analytics'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { useGameTimer } from './hooks/useGameTimer'

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
    return (
        <div className="ttt-board-wrap">
            <div className="ttt-board" data-testid={testId}>
                {board.map((row, ri) =>
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

function TttPlayerCard({ name, symbol, isActive, isWinner, side, avatarSrc, isPremium, t }: {
    name: string; symbol: 'X' | 'O'; isActive: boolean; isWinner: boolean; side: 'left' | 'right'; avatarSrc?: string | null; isPremium?: boolean; t: (key: TranslationKeys) => string
}) {
    const bg = symbol === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)'
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 14,
            background: isActive ? 'white' : 'transparent',
            border: '2px solid ' + (isActive ? 'var(--bd-ink)' : 'transparent'),
            boxShadow: isActive ? '0 4px 0 var(--bd-ink)' : 'none',
            flexDirection: side === 'right' ? 'row-reverse' : 'row',
            transition: 'all 0.2s', minWidth: 0,
        }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
                {avatarSrc ? (
                    <img src={avatarSrc} alt={name} style={{
                        width: 42, height: 42, borderRadius: '50%', objectFit: 'cover',
                        border: '2px solid white', boxShadow: '0 0 0 2px var(--bd-ink)',
                    }} />
                ) : (
                <div style={{
                    width: 42, height: 42, borderRadius: '50%', background: bg,
                    display: 'grid', placeItems: 'center', border: '2px solid white',
                    boxShadow: '0 0 0 2px var(--bd-ink)',
                    fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 18, color: 'white',
                }}>
                    {name.charAt(0).toUpperCase()}
                </div>
                )}
                <div style={{
                    position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 7,
                    background: 'white', border: '2px solid var(--bd-ink)', display: 'grid', placeItems: 'center',
                }}>
                    <TttMark mark={symbol} size={14} />
                </div>
            </div>
            <div style={{ textAlign: side === 'right' ? 'right' : 'left', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isPremium ? '#F59E0B' : undefined }}>{name}</span>
                    {isPremium && <span style={{ fontSize: 12, flexShrink: 0 }} title="Premium">👑</span>}
                    {isWinner && (
                        <span style={{
                            display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                            background: 'var(--bd-sun)', color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)',
                            boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)', whiteSpace: 'nowrap',
                        }}>{t('games.tictactoe.game.winBadge')}</span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bd-ink-muted)', marginTop: 1 }}>{symbol}</div>
                {isActive && (
                    <div style={{
                        marginTop: 2, fontSize: 10, color: 'var(--bd-ink)', fontWeight: 600,
                        display: 'flex', gap: 4, alignItems: 'center',
                        justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
                    }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--bd-mint-deep)', display: 'inline-block' }} />
                        {t('games.tictactoe.game.theirTurn')}
                    </div>
                )}
            </div>
        </div>
    )
}

function TttStatusBanner({ isFinished, winnerName, isDraw, currentSymbol, currentPlayerName, secs, moveNum, turnTimerLimit, isSpectator, t }: {
    isFinished: boolean; winnerName: string | null; isDraw: boolean;
    currentSymbol: 'X' | 'O'; currentPlayerName: string; secs: number; moveNum: number; turnTimerLimit: number;
    isSpectator?: boolean;
    t: (key: TranslationKeys, opts?: string | Record<string, unknown>) => string;
}) {
    if (isFinished && !isDraw && winnerName) {
        return (
            <div style={{
                padding: '10px 16px', borderRadius: 14, background: 'var(--bd-ink)', color: 'var(--bd-bg)',
                display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 0 var(--bd-coral)',
            }}>
                <span style={{
                    display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: 'var(--bd-sun)', color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)',
                    boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)',
                }}>{t('games.tictactoe.game.victoryBadge')}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t('games.tictactoe.game.playerWins', { player: winnerName })}</span>
            </div>
        )
    }
    if (isFinished && isDraw) {
        return (
            <div style={{
                padding: '10px 16px', borderRadius: 14, background: 'var(--bd-ink)', color: 'var(--bd-bg)',
                display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 0 var(--bd-lav)',
            }}>
                <span style={{
                    display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: 'var(--bd-lav)', color: 'white', border: '2px solid var(--bd-ink)',
                    boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)',
                }}>{t('games.tictactoe.game.drawBadge')}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t('games.tictactoe.game.catsGameFull')}</span>
            </div>
        )
    }
    if (isSpectator) {
        return (
            <div style={{
                padding: '10px 14px', borderRadius: 14, background: 'white',
                border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <span style={{ fontSize: 14 }}>👁</span>
                <TttMark mark={currentSymbol} size={20} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)' }}>{currentPlayerName}</span>
                <span style={{ fontSize: 11, color: 'var(--bd-ink-muted)', marginLeft: 2 }}>#{moveNum}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--bd-ink-muted)', whiteSpace: 'nowrap' }}>{t('game.ui.spectatingBadge')}</span>
            </div>
        )
    }
    const pct = turnTimerLimit > 0 ? (secs / turnTimerLimit) * 100 : 100
    const danger = secs <= 5
    return (
        <div style={{
            padding: '10px 14px', borderRadius: 14, background: 'white',
            border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
            display: 'flex', alignItems: 'center', gap: 12,
        }}>
            <TttMark mark={currentSymbol} size={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {t('games.tictactoe.game.playerTurn', { player: currentPlayerName })}
                    <span style={{ color: 'var(--bd-ink-muted)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>
                        {t('games.tictactoe.game.moveNum', { num: moveNum })}
                    </span>
                </div>
                <div style={{ marginTop: 6, height: 5, background: 'var(--bd-bg2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: pct + '%',
                        background: danger ? 'var(--bd-coral)' : currentSymbol === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)',
                        transition: 'width 1s linear, background 0.2s',
                    }} />
                </div>
            </div>
            <div style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, minWidth: 44, textAlign: 'right',
                color: danger ? 'var(--bd-coral-deep)' : 'var(--bd-ink)',
            }}>
                :{String(secs).padStart(2, '0')}
            </div>
        </div>
    )
}

function TttResultModal({ winnerName, winnerSymbol, isDraw, onPlayAgain, onLeave, isLoading, t }: {
    winnerName: string | null; winnerSymbol: string | null; isDraw: boolean;
    onPlayAgain: () => void; onLeave: () => void; isLoading: boolean; t: (key: TranslationKeys, opts?: string | Record<string, unknown>) => string;
}) {
    const color = winnerSymbol === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)'
    return (
        <div style={{
            background: 'white', borderRadius: 22, padding: '24px 32px', textAlign: 'center',
            boxShadow: '0 10px 0 var(--bd-ink)', border: '2px solid var(--bd-ink)', maxWidth: 320,
            animation: 'ttt-overlay-in 0.45s cubic-bezier(0.2,0.7,0.2,1)',
        }}>
            {!isDraw ? (
                <>
                    <div style={{
                        margin: '0 auto 10px', width: 60, height: 60, borderRadius: '50%', background: color,
                        display: 'grid', placeItems: 'center', boxShadow: '0 5px 0 var(--bd-ink)',
                    }}>
                        {winnerSymbol && <TttMark mark={winnerSymbol as 'X' | 'O'} size={36} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                        {t('games.tictactoe.game.roundOver')}
                    </div>
                    <h2 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1.05, marginBottom: 4, color: 'var(--bd-ink)' }}>
                        {t('games.tictactoe.game.playerWins', { player: winnerName })}
                    </h2>
                    <p style={{ color: 'var(--bd-ink-soft)', fontSize: 13, marginBottom: 14 }}>{t('games.tictactoe.game.cleanRun')}</p>
                </>
            ) : (
                <>
                    <div style={{
                        margin: '0 auto 10px', width: 60, height: 60, borderRadius: '50%', background: 'var(--bd-bg2)',
                        display: 'grid', placeItems: 'center', fontSize: 30, boxShadow: '0 5px 0 var(--bd-ink)', border: '2px solid var(--bd-ink)',
                    }}>🤝</div>
                    <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                        {t('games.tictactoe.game.roundOver')}
                    </div>
                    <h2 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1.05, marginBottom: 4, color: 'var(--bd-ink)' }}>
                        {t('games.tictactoe.game.itsADraw')}
                    </h2>
                    <p style={{ color: 'var(--bd-ink-soft)', fontSize: 13, marginBottom: 14 }}>{t('games.tictactoe.game.catsGameResult')}</p>
                </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={onLeave} style={{
                    padding: '8px 14px', fontSize: 13, borderRadius: 14, fontWeight: 600,
                    background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink-soft)', cursor: 'pointer', fontFamily: 'inherit',
                }}>{t('games.tictactoe.game.leave')}</button>
                <button onClick={onPlayAgain} disabled={isLoading} style={{
                    padding: '12px 20px', fontSize: 15, borderRadius: 14, fontWeight: 600,
                    background: 'var(--bd-coral)', color: 'white', border: 'none',
                    boxShadow: '0 4px 0 var(--bd-coral-deep)', cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.7 : 1, fontFamily: 'inherit',
                }}>{isLoading ? '…' : t('games.tictactoe.game.playAgainBtn')}</button>
            </div>
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
}

interface TicTacToeLobbyPageProps {
    code: string
    isSpectator?: boolean
}

interface LocalChatMsg { id: number; who: string; text: string; time: string; color: string }

const LEAVE_REQUEST_TIMEOUT_MS = 2500
const LEAVE_REDIRECT_FALLBACK_MS = 1500
const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600
type LeaveApiOutcome = 'pending' | 'ok' | 'non_ok' | 'timeout' | 'error'

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

export default function TicTacToeLobbyPage({ code, isSpectator = false }: TicTacToeLobbyPageProps) {
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
    const isLeavingLobbyRef = React.useRef(false)
    const lifecycleRedirectInFlightRef = React.useRef(false)
    const activeGameIdRef = React.useRef<string | null>(null)
    const leaveStartedAtRef = React.useRef<number | null>(null)
    const leaveApiOutcomeRef = React.useRef<LeaveApiOutcome>('pending')
    const leaveApiStatusCodeRef = React.useRef<number | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'tic_tac_toe').minPlayersRequired

    // Design states
    const [mobileTab, setMobileTab] = useState<'board' | 'history' | 'chat'>('board')
    const [localChat, setLocalChat] = useState<LocalChatMsg[]>([])
    const [chatInput, setChatInput] = useState('')
    const chatRef = useRef<HTMLDivElement>(null)
    const chatCurrentUserIdRef = useRef<string | null>(null)
    const chatStatePlayersRef = useRef<Array<{ id: string }>>([])


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
        [isGuest]
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
    }, [router, code])

    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    const applyAuthoritativeState = useCallback(
        (gameId: string, authoritativeState: unknown, statusOverride?: Game['status']): boolean => {
            if (!authoritativeState || typeof authoritativeState !== 'object') return false
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
                router.push('/games')
                return
            }
            const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(data, { includeFinished: true })
            if (!lobbyPayload) throw new Error('Invalid lobby response')
            setLobby(lobbyPayload as Lobby)
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
    }, [loadLobby, triggerLifecycleRedirect])

    const handlePlayerLeft = useCallback((data: {
        userId: string; username?: string; playerName?: string; remainingPlayers?: number;
        nextCreatorId?: string; nextCreatorName?: string;
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
        if (typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
            triggerLifecycleRedirect('player-left:insufficient-players')
            return
        }
        void loadLobby()
    }, [loadLobby, minPlayersRequired, triggerLifecycleRedirect, isGuest, guestId, session?.user?.id])

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
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

  const handleChatMessage = useCallback((msg: ChatMessagePayload) => {
    if (msg.userId === chatCurrentUserIdRef.current) return
    const d = new Date(msg.timestamp)
    const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    const pIdx = chatStatePlayersRef.current.findIndex(p => p.id === msg.userId)
    const color = pIdx === 0 ? 'coral' : pIdx === 1 ? 'lav' : 'sky'
    setLocalChat(c => [...c, { id: msg.timestamp, who: msg.username, text: msg.message, time, color }])
  }, [])

  const { emitWhenConnected } = useRealtimeConnection({
    code,
    shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken)),
    onGameUpdate: handleGameUpdate,
    onGameAbandoned: handleGameAbandoned,
    onPlayerLeft: handlePlayerLeft,
    onChatMessage: handleChatMessage,
  })

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
        if (!gameEngine || !game || isMoveSubmitting) return false
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
            setIsMoveSubmitting(true)
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
            if (authoritativeState && !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status)) await loadLobby()
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
                if (winner) showToast.success('games.tictactoe.game.gameWon')
                else showToast.info('game.ui.gameFinished')
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
            setIsMoveSubmitting(false)
        }
    }, [applyAuthoritativeState, gameEngine, game, code, getCurrentUserId, loadLobby, isMoveSubmitting, isGuest])

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

    const { timeLeft } = useGameTimer({
        isMyTurn: isSpectator ? false : isMyTurn(),
        gameState: timerStateData?.pendingRequest ? null : timerState,
        turnTimerLimit,
        onTimeout: async (): Promise<boolean> => {
            if (!gameEngine || !game || !isMyTurn()) {
                return true
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

    const handleLeave = async () => {
        if (isLeavingLobbyRef.current) return
        isLeavingLobbyRef.current = true
        setShowLeaveConfirmModal(false)
        leaveStartedAtRef.current = Date.now()
        leaveApiOutcomeRef.current = 'pending'
        leaveApiStatusCodeRef.current = null
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), LEAVE_REQUEST_TIMEOUT_MS)
        void fetchWithGuest(`/api/lobby/${code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, signal: controller.signal })
            .then(async (response) => {
                clearTimeout(timeoutId)
                leaveApiStatusCodeRef.current = response.status
                if (!response.ok) {
                    leaveApiOutcomeRef.current = 'non_ok'
                    const payload = await response.json().catch(() => null)
                    clientLogger.warn('Tic-Tac-Toe leave API returned non-ok status', { code, status: response.status, payload })
                } else {
                    leaveApiOutcomeRef.current = 'ok'
                }
            })
            .catch((error) => {
                clearTimeout(timeoutId)
                if ((error as Error)?.name === 'AbortError') {
                    leaveApiOutcomeRef.current = 'timeout'
                    clientLogger.warn('Tic-Tac-Toe leave API timed out after redirect', { code, timeoutMs: LEAVE_REQUEST_TIMEOUT_MS })
                    return
                }
                leaveApiOutcomeRef.current = 'error'
                clientLogger.warn('Tic-Tac-Toe leave API failed after redirect', { code, error })
            })
        navigateAfterLeave()
    }

    const handlePlayAgain = useCallback(async () => {
        if (!lobby || !game || !gameEngine) { router.push(`/lobby/${code}`); return }
        const userId = getCurrentUserId()
        if (!userId) { router.push(`/lobby/${code}`); return }
        const gameData = gameEngine.getState().data as TicTacToeGameData
        const targetRounds = gameData.match?.targetRounds ?? null
        const roundsPlayed = gameData.match?.roundsPlayed ?? 0
        const isMatchComplete = targetRounds !== null && roundsPlayed >= targetRounds
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
                if (!authoritativeState || !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status)) await loadLobby()
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

    // ─── Design effects ───────────────────────────────────────────────────────

    // Scroll chat to bottom
    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    }, [localChat])

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
    chatCurrentUserIdRef.current = currentUserId ?? null
    chatStatePlayersRef.current = state.players
    const myPlayerIndex = state.players.findIndex(p => p.id === currentUserId)
    const mySymbol: PlayerSymbol | null = myPlayerIndex === 0 ? 'X' : myPlayerIndex === 1 ? 'O' : null
    const opponentSymbol: PlayerSymbol | null = mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : null
    const isLobbyCreator = currentUserId === lobby.creatorId

    const match = gameData.match
    const roundsPlayedNum = match?.roundsPlayed ?? 0
    const targetRounds = match?.targetRounds ?? null
    const isMatchComplete = targetRounds !== null && roundsPlayedNum >= targetRounds
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

    const sendChat = () => {
        if (!chatInput.trim()) return
        const now = new Date()
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        setLocalChat(c => [...c, { id: Date.now(), who: mySymbol === 'X' ? xName : oName, text: chatInput.trim(), time, color: mySymbol === 'X' ? 'coral' : 'lav' }])
        emitWhenConnected('chat-message', { lobbyCode: code, message: chatInput.trim(), userId: getCurrentUserId(), username: mySymbol === 'X' ? xName : oName, timestamp: Date.now() })
        setChatInput('')
    }

    const quickReact = (emoji: string) => {
        const now = new Date()
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        setLocalChat(c => [...c, { id: Date.now(), who: mySymbol === 'X' ? xName : oName, text: emoji, time, color: mySymbol === 'X' ? 'coral' : 'lav' }])
        emitWhenConnected('chat-message', { lobbyCode: code, message: emoji, userId: getCurrentUserId(), username: mySymbol === 'X' ? xName : oName, timestamp: Date.now() })
    }

    // ─── Sections ─────────────────────────────────────────────────────────────

    const headerSection = (
        <div className="ttt-card" style={{
            background: 'linear-gradient(135deg, white 0%, rgba(255,196,77,0.10) 100%)',
            overflow: 'hidden', padding: '12px 16px',
        }}>
            <div style={{ position: 'absolute', right: -30, top: -30, opacity: 0.4, transform: 'rotate(8deg)', pointerEvents: 'none' }}>
                <TttBgGrid />
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
                <TttPlayerCard name={xName} symbol="X" isActive={!isFinished && gameData.currentSymbol === 'X'} isWinner={!isDraw && winnerSymbol === 'X'} side="left" avatarSrc={xAvatar} isPremium={xIsPremium} t={t} />
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                        Round {roundNum}
                    </div>
                    <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {xWins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{oWins}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                        {drawsCount} draws{targetRounds ? ` · BO${targetRounds}` : ''}
                    </div>
                </div>
                <TttPlayerCard name={oName} symbol="O" isActive={!isFinished && gameData.currentSymbol === 'O'} isWinner={!isDraw && winnerSymbol === 'O'} side="right" avatarSrc={oAvatar} isPremium={oIsPremium} t={t} />
            </div>
        </div>
    )

    const statusSection = (
        <TttStatusBanner
            isFinished={isFinished}
            winnerName={winnerName}
            isDraw={isDraw}
            currentSymbol={gameData.currentSymbol}
            currentPlayerName={gameData.currentSymbol === 'X' ? xName : oName}
            secs={timeLeft}
            moveNum={gameData.moveCount + 1}
            turnTimerLimit={turnTimerLimit}
            isSpectator={isSpectator}
            t={t}
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
            {isFinished && !isSpectator && (
                <div className="ttt-board-overlay">
                    <TttResultModal
                        winnerName={winnerName}
                        winnerSymbol={winnerSymbol && !isDraw ? winnerSymbol : null}
                        isDraw={isDraw}
                        onPlayAgain={handlePlayAgain}
                        onLeave={() => setShowLeaveConfirmModal(true)}
                        isLoading={isRematchSubmitting || (isMatchComplete && !isLobbyCreator)}
                        t={t}
                    />
                </div>
            )}
        </div>
    )

    const actionsSection = isSpectator ? (
        <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/lobby/${code}`} style={{ padding: '8px 14px', fontSize: 13, borderRadius: 14, fontWeight: 600, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink-soft)', textDecoration: 'none', fontFamily: 'inherit' }}>
                {t('game.ui.backToLobby')}
            </a>
        </div>
    ) : (
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
                🤝 {t('games.tictactoe.game.drawBtn')}
            </button>
            <button onClick={() => setShowLeaveConfirmModal(true)} style={{ padding: '8px 14px', fontSize: 13, borderRadius: 14, fontWeight: 600, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-coral-deep)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('games.tictactoe.game.leaveLobby')}
            </button>
        </div>
    )

    const historySection = (
        <div className="ttt-history-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('game.ui.moves')}</h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {moveHistory.length}/9
                </span>
            </div>
            <div className="ttt-history-list">
                {moveHistory.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.tictactoe.game.noMovesYet')}</div>
                    : moveHistory.slice().reverse().map((m: TicTacToeMoveRecord, index) => (
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

    const chatSection = (
        <div className="ttt-chat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--bd-line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('chat.open')}</h3>
                    <span className="bd-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bd-mint-deep)', display: 'inline-block' }} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                    {t('game.ui.inMatch', { count: players.length })}
                </span>
            </div>
            <div ref={chatRef} className="ttt-chat-feed">
                {localChat.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>{t('chat.noMessages')}</div>
                    : localChat.map(msg => (
                        <div key={msg.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: msg.color === 'coral' ? 'var(--bd-coral)' : msg.color === 'lav' ? 'var(--bd-lav)' : 'var(--bd-sky)',
                                display: 'grid', placeItems: 'center',
                                fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 10, color: 'white',
                            }}>
                                {msg.who.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                    <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--bd-ink)' }}>{msg.who}</span>
                                    <span style={{ fontSize: 9, color: 'var(--bd-ink-muted)' }}>{msg.time}</span>
                                </div>
                                <div style={{
                                    background: 'var(--bd-card-warm)', padding: '5px 9px', borderRadius: 8,
                                    fontSize: 12, lineHeight: 1.35, display: 'inline-block',
                                    maxWidth: '100%', wordBreak: 'break-word', marginTop: 2, color: 'var(--bd-ink)',
                                }}>{msg.text}</div>
                            </div>
                        </div>
                    ))
                }
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--bd-line)' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                    {['gg', 'nice', '😂', '🔥', '🤝'].map(e => (
                        <button key={e} onClick={() => quickReact(e)} style={{
                            padding: '3px 8px', borderRadius: 999, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)',
                            fontSize: 11, cursor: 'pointer', fontWeight: 600, color: 'var(--bd-ink-soft)', fontFamily: 'inherit',
                        }}>{e}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        style={{
                            flex: 1, padding: '8px 10px', fontSize: 12, border: '2px solid var(--bd-line)',
                            borderRadius: 12, background: 'white', outline: 'none', fontFamily: 'inherit', color: 'var(--bd-ink)',
                        }}
                        placeholder={t('game.ui.chatPlaceholder')}
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendChat()}
                    />
                    <button onClick={sendChat} aria-label={t('chat.send')} style={{
                        padding: '8px 12px', borderRadius: 14, background: 'var(--bd-ink)', color: 'var(--bd-bg)',
                        border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13,
                        boxShadow: '0 4px 0 var(--bd-coral)', fontFamily: 'inherit',
                    }}>↗</button>
                </div>
            </div>
        </div>
    )

    // Show score summary below player cards when match has results
    const _ = { myWins, myLosses, drawsCount, mySymbol, isMatchComplete, isLobbyCreator }
    void _

    const themeStyle = { background: getLobbyTheme(lobby.theme).bg, color: getLobbyTheme(lobby.theme).text }

    return (
        <div className="ttt-screen" style={themeStyle}>

            {/* ── DESKTOP ─────────────────────────────────────────────────── */}
            <div className="ttt-desktop-layout">
                <div className="ttt-grid">
                    <div className="ttt-center-col">
                        {headerSection}
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

            {/* ── MOBILE ──────────────────────────────────────────────────── */}
            <div className="ttt-mobile-layout">
                {headerSection}
                {statusSection}
                {requestSection}
                <div className="ttt-tabs">
                    {([
                        { id: 'board', label: 'Board' },
                        { id: 'history', label: `Moves (${moveHistory.length})` },
                        { id: 'chat', label: 'Chat' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            className={`ttt-tab${mobileTab === tab.id ? ' ttt-tab-active' : ''}`}
                            onClick={() => setMobileTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {mobileTab === 'board' && <>{renderBoardSection()}{actionsSection}</>}
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
                    icon="🚪"
                />
            )}
            {!isSpectator && resolvedStatus === 'playing' && (
                <ReactionOverlay lobbyCode={code} />
            )}
        </div>
    )
}
