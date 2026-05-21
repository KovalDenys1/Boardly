'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { useGameTimer } from './hooks/useGameTimer'

// ─── Design sub-components ────────────────────────────────────────────────────

const DISC_RED = 'var(--bd-coral)'
const DISC_YELLOW = 'var(--bd-sun)'
const DISC_EMPTY = 'var(--bd-bg2)'

function C4Disc({ disc, isWin, pop }: { disc: PlayerDisc | null; isWin?: boolean; pop?: boolean }) {
    const color = disc === 1 ? DISC_RED : disc === 2 ? DISC_YELLOW : DISC_EMPTY
    const shadow = disc === 1 ? '0 2px 6px rgba(255,107,91,0.45)' : disc === 2 ? '0 2px 6px rgba(255,196,77,0.45)' : 'none'
    const scale = isWin ? 'scale(1.12)' : 'scale(1)'
    const anim = pop ? 'c4-drop 0.22s cubic-bezier(0.2,1.6,0.4,1) both' : undefined
    return (
        <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: color,
            boxShadow: isWin ? `0 0 0 3px white, ${shadow}` : shadow,
            transform: scale,
            transition: 'transform 0.15s, box-shadow 0.15s',
            animation: anim,
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

    return (
        <div style={{ position: 'relative', userSelect: 'none' }}>
            {/* Drop indicator arrows */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, marginBottom: 4, gap: 3 }}>
                {Array.from({ length: COLS }, (_, c) => (
                    <div key={c} style={{
                        height: 20, display: 'grid', placeItems: 'center',
                        opacity: hoverCol === c && !disabled && board[0][c] === null ? 1 : 0,
                        transition: 'opacity 0.12s',
                    }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 1v9M3 7l4 5 4-5" stroke={currentDisc === 1 ? DISC_RED : DISC_YELLOW} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                ))}
            </div>

            {/* Board grid */}
            <div style={{
                background: 'var(--bd-ink)',
                borderRadius: 16,
                padding: 8,
                boxShadow: '0 8px 24px rgba(31,27,22,0.24)',
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                gap: 6,
            }}>
                {Array.from({ length: ROWS }, (_, r) =>
                    Array.from({ length: COLS }, (_, c) => {
                        const cell = board[r][c]
                        const win = isWin(r, c)
                        const colFull = board[0][c] !== null
                        return (
                            <button
                                key={`${r}-${c}`}
                                onClick={() => !colFull && !disabled && onColClick(c)}
                                onMouseEnter={() => !disabled && !colFull && onColHover(c)}
                                onMouseLeave={() => onColHover(null)}
                                disabled={disabled || colFull}
                                aria-label={`column ${c + 1}`}
                                style={{
                                    width: 'clamp(34px, calc((100vw - 104px) / 7), 52px)',
                                    height: 'clamp(34px, calc((100vw - 104px) / 7), 52px)',
                                    borderRadius: '50%',
                                    padding: 3,
                                    background: 'rgba(255,255,255,0.10)',
                                    border: 'none',
                                    cursor: disabled || colFull ? 'not-allowed' : 'pointer',
                                    outline: 'none',
                                    display: 'grid',
                                    placeItems: 'center',
                                    overflow: 'hidden',
                                }}
                            >
                                <C4Disc disc={cell} isWin={win} pop={!!cell && r === lastDroppedRow && c === lastDroppedCol} />
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
                    const colFull = board[0][c] !== null
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

function C4PlayerCard({ name, disc, isActive, isWinner, wins, side, isLocalPlayer, avatarSrc, isPremium, t }: {
    name: string; disc: PlayerDisc; isActive: boolean; isWinner: boolean; wins: number; side: 'left' | 'right';
    isLocalPlayer: boolean; avatarSrc?: string | null; isPremium?: boolean; t: (k: TranslationKeys) => string
}) {
    const discColor = disc === 1 ? DISC_RED : DISC_YELLOW
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 14,
            background: isActive ? 'var(--bd-input-bg)' : 'transparent',
            border: '2px solid ' + (isActive ? 'var(--bd-ink)' : 'transparent'),
            boxShadow: isActive ? '0 4px 0 var(--bd-ink)' : 'none',
            flexDirection: side === 'right' ? 'row-reverse' : 'row',
            transition: 'all 0.2s', minWidth: 0,
        }}>
            {/* Avatar + disc badge */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
                {avatarSrc ? (
                    <img src={avatarSrc} alt={name} style={{
                        width: 42, height: 42, borderRadius: '50%', objectFit: 'cover',
                        border: '2px solid var(--bd-input-bg)', boxShadow: '0 0 0 2px var(--bd-ink)',
                    }} />
                ) : (
                <div style={{
                    width: 42, height: 42, borderRadius: '50%', background: discColor,
                    display: 'grid', placeItems: 'center', border: '2px solid var(--bd-input-bg)',
                    boxShadow: '0 0 0 2px var(--bd-ink)',
                    fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 18, color: 'white',
                }}>
                    {name.charAt(0).toUpperCase()}
                </div>
                )}
                {/* Disc icon badge */}
                <div style={{
                    position: 'absolute', bottom: -3, right: -3, width: 20, height: 20,
                    borderRadius: '50%', background: discColor,
                    border: '2px solid var(--bd-ink)', boxShadow: '1px 1px 0 var(--bd-ink)',
                }} />
            </div>
            <div style={{ textAlign: side === 'right' ? 'right' : 'left', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isPremium ? '#F59E0B' : undefined }}>
                        {name}
                    </span>
                    {isPremium && <span style={{ fontSize: 12, flexShrink: 0 }} title="Premium">👑</span>}
                    {isWinner && (
                        <span style={{
                            display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                            background: 'var(--bd-sun)', color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)',
                            boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)', whiteSpace: 'nowrap',
                        }}>WIN</span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bd-ink-muted)', marginTop: 1 }}>
                    {wins}W
                </div>
                {isActive && (
                    <div style={{
                        marginTop: 2, fontSize: 10, color: 'var(--bd-ink)', fontWeight: 600,
                        display: 'flex', gap: 4, alignItems: 'center',
                        justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
                    }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: discColor, display: 'inline-block' }} />
                        {isLocalPlayer ? t('games.connect_four.game.yourTurn') : t('games.connect_four.game.theirTurn')}
                    </div>
                )}
            </div>
        </div>
    )
}

function C4StatusBanner({ isFinished, winnerName, isDraw, currentDisc, currentPlayerName, secs, moveCount, turnTimerLimit, isSpectator, t }: {
    isFinished: boolean; winnerName: string | null; isDraw: boolean;
    currentDisc: PlayerDisc; currentPlayerName: string; secs: number; moveCount: number; turnTimerLimit: number;
    isSpectator?: boolean;
    t: (k: TranslationKeys, opts?: Record<string, unknown>) => string;
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
                }}>🏆</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t('games.connect_four.game.playerWins', { player: winnerName })}</span>
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
                }}>🤝</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t('games.connect_four.game.draw')}</span>
            </div>
        )
    }
    if (isSpectator) {
        const discColor = currentDisc === 1 ? DISC_RED : DISC_YELLOW
        return (
            <div style={{
                padding: '10px 14px', borderRadius: 14, background: 'var(--bd-bg)',
                border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <span style={{ fontSize: 14 }}>👁</span>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: discColor, flexShrink: 0, boxShadow: '0 0 0 2px var(--bd-ink)' }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)' }}>{currentPlayerName}</span>
                <span style={{ fontSize: 11, color: 'var(--bd-ink-muted)', marginLeft: 2 }}>#{moveCount + 1}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--bd-ink-muted)', whiteSpace: 'nowrap' }}>{t('game.ui.spectatingBadge')}</span>
            </div>
        )
    }
    const pct = turnTimerLimit > 0 ? (secs / turnTimerLimit) * 100 : 100
    const danger = secs <= 5
    const barColor = currentDisc === 1 ? DISC_RED : DISC_YELLOW
    return (
        <div style={{
            padding: '10px 14px', borderRadius: 14, background: 'var(--bd-bg)',
            border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
            display: 'flex', alignItems: 'center', gap: 12,
        }}>
            <div style={{
                width: 28, height: 28, borderRadius: '50%', background: barColor, flexShrink: 0,
                boxShadow: `0 0 0 2px var(--bd-ink)`,
                transition: 'background 0.2s',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentPlayerName}
                    <span style={{ color: 'var(--bd-ink-muted)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>
                        #{moveCount + 1}
                    </span>
                </div>
                <div style={{ marginTop: 6, height: 5, background: 'var(--bd-bg2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: pct + '%',
                        background: danger ? 'var(--bd-coral)' : barColor,
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

function C4ResultOverlay({ winnerName, isDraw, isMyWin, onPlayAgain, onReturnToLobby, onLeave, isLoading, isHost, t }: {
    winnerName: string | null; isDraw: boolean; isMyWin: boolean
    onPlayAgain: () => void; onReturnToLobby: () => void; onLeave: () => void; isLoading: boolean; isHost: boolean
    t: (k: TranslationKeys, opts?: Record<string, unknown>) => string
}) {
    return (
        <div style={{
            position: 'absolute', inset: 0, borderRadius: 16,
            background: 'rgba(31,27,22,0.82)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: 24, backdropFilter: 'blur(4px)',
        }}>
            <div style={{ fontSize: 40 }}>{isDraw ? '🤝' : isMyWin ? '🏆' : '😔'}</div>
            <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 24, color: 'white', textAlign: 'center' }}>
                {isDraw ? t('games.connect_four.game.draw') : winnerName ? t('games.connect_four.game.playerWins', { player: winnerName }) : t('games.connect_four.game.gameWon')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 240 }}>
                {isHost ? (
                    <>
                        <button
                            onClick={onPlayAgain}
                            disabled={isLoading}
                            style={{
                                padding: '12px 20px', borderRadius: 14, fontWeight: 700, fontSize: 15,
                                background: 'var(--bd-mint-deep)', color: 'white', border: 'none',
                                cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.65 : 1,
                                fontFamily: 'inherit', boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
                            }}
                        >
                            {t('games.connect_four.game.playAgain')}
                        </button>
                        <button
                            onClick={onReturnToLobby}
                            disabled={isLoading}
                            style={{
                                padding: '10px 20px', borderRadius: 14, fontWeight: 600, fontSize: 14,
                                background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.25)',
                                cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.65 : 1, fontFamily: 'inherit',
                            }}
                        >
                            {t('game.ui.returnToLobby')}
                        </button>
                    </>
                ) : (
                    <div style={{
                        padding: '12px 20px', borderRadius: 14, fontWeight: 600, fontSize: 14,
                        background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)',
                        border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', fontFamily: 'inherit',
                    }}>
                        {t('game.ui.waitingForHost')}
                    </div>
                )}
                <button
                    onClick={onLeave}
                    style={{
                        padding: '10px 20px', borderRadius: 14, fontWeight: 600, fontSize: 14,
                        background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                        cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    {t('games.connect_four.game.leave')}
                </button>
            </div>
        </div>
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

interface ConnectFourLobbyPageProps {
    code: string
    isSpectator?: boolean
    onGameReset?: () => void
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
    const isLeavingLobbyRef = React.useRef(false)
    const isMoveSubmittingRef = React.useRef(false)
    const lifecycleRedirectInFlightRef = React.useRef(false)
    const activeGameIdRef = React.useRef<string | null>(null)
    const leaveStartedAtRef = React.useRef<number | null>(null)
    const leaveApiOutcomeRef = React.useRef<LeaveApiOutcome>('pending')
    const leaveApiStatusCodeRef = React.useRef<number | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'connect_four').minPlayersRequired

    const [mobileTab, setMobileTab] = useState<'board' | 'history' | 'chat'>('board')
    const [isMobile, setIsMobile] = useState(false)
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
                source: 'connect_four_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'connect_four',
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
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'c4-lifecycle-redirect' })
        clientLogger.warn('Connect Four lifecycle redirect triggered', { code, reason, target: '/games' })
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

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 Connect Four game abandoned:', data)
        if (isLeavingLobbyRef.current) return
        void loadLobby()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobby, triggerLifecycleRedirect])

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
        const color = pIdx === 0 ? 'coral' : pIdx === 1 ? 'sun' : 'sky'
        setLocalChat(c => [...c, { id: msg.timestamp, who: msg.username, text: msg.message, time, color }])
    }, [])

    const handleGameReset = useCallback(() => {
        if (onGameReset) onGameReset()
        else router.push(`/lobby/${code}`)
    }, [code, onGameReset, router])

    const { emitWhenConnected } = useRealtimeConnection({
        code,
        shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken)),
        onGameUpdate: handleGameUpdate,
        onGameAbandoned: handleGameAbandoned,
        onPlayerLeft: handlePlayerLeft,
        onChatMessage: handleChatMessage,
        onGameReset: handleGameReset,
    })

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
            if (authoritativeState && !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status)) await loadLobby()
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
                if (winner) showToast.success('games.connect_four.game.gameWon')
                else showToast.info('game.ui.gameFinished')
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
    const timerStateData = timerState?.data as ConnectFourGameData | undefined
    const turnTimerLimit =
        typeof lobby?.turnTimer === 'number' && Number.isFinite(lobby.turnTimer) && lobby.turnTimer > 0
            ? Math.floor(lobby.turnTimer)
            : 30

    const { timeLeft } = useGameTimer({
        isMyTurn: isSpectator ? false : isMyTurn(),
        gameState: timerStateData?.pendingRequest ? null : timerState,
        turnTimerLimit,
        onTimeout: async (): Promise<boolean> => {
            if (!gameEngine || !game || !isMyTurn()) return true
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
                    clientLogger.warn('Connect Four leave API returned non-ok status', { code, status: response.status, payload })
                } else {
                    leaveApiOutcomeRef.current = 'ok'
                }
            })
            .catch((error) => {
                clearTimeout(timeoutId)
                if ((error as Error)?.name === 'AbortError') {
                    leaveApiOutcomeRef.current = 'timeout'
                    return
                }
                leaveApiOutcomeRef.current = 'error'
                clientLogger.warn('Connect Four leave API failed after redirect', { code, error })
            })
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
                if (!authoritativeState || !applyAuthoritativeState(game.id, authoritativeState, data?.game?.status)) await loadLobby()
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

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 899px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

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
    // eslint-disable-next-line react-hooks/refs
    chatCurrentUserIdRef.current = currentUserId ?? null
    // eslint-disable-next-line react-hooks/refs
    chatStatePlayersRef.current = state.players

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

    const sendChat = () => {
        if (!chatInput.trim()) return
        const now = new Date()
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        const myName = myDisc === 1 ? p1Name : p2Name
        const myColor = myDisc === 1 ? 'coral' : 'sun'
        setLocalChat(c => [...c, { id: Date.now(), who: myName, text: chatInput.trim(), time, color: myColor }])
        emitWhenConnected('chat-message', { lobbyCode: code, message: chatInput.trim(), userId: getCurrentUserId(), username: myName, timestamp: Date.now() })
        setChatInput('')
    }

    const quickReact = (emoji: string) => {
        const now = new Date()
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        const myName = myDisc === 1 ? p1Name : p2Name
        const myColor = myDisc === 1 ? 'coral' : 'sun'
        setLocalChat(c => [...c, { id: Date.now(), who: myName, text: emoji, time, color: myColor }])
        emitWhenConnected('chat-message', { lobbyCode: code, message: emoji, userId: getCurrentUserId(), username: myName, timestamp: Date.now() })
    }

    // ─── Sections ─────────────────────────────────────────────────────────────

    const headerSection = (
        <div className="ttt-card" style={{ background: 'linear-gradient(135deg, white 0%, rgba(255,196,77,0.08) 100%)', padding: '12px 16px', overflow: 'hidden' }}>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                <C4PlayerCard name={p1Name} disc={1} isActive={!isFinished && gameData.currentDisc === 1} isWinner={!isDraw && winnerDisc === 1} wins={p1Wins} side="left" isLocalPlayer={myDisc === 1} avatarSrc={p1Avatar} isPremium={p1IsPremium} t={t} />
                <div style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                        <GameIcon gameId="connect-four" accentColor={DISC_RED} size={18} />
                    </div>
                    <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {p1Wins}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{p2Wins}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                        wins
                    </div>
                </div>
                <C4PlayerCard name={p2Name} disc={2} isActive={!isFinished && gameData.currentDisc === 2} isWinner={!isDraw && winnerDisc === 2} wins={p2Wins} side="right" isLocalPlayer={myDisc === 2} avatarSrc={p2Avatar} isPremium={p2IsPremium} t={t} />
            </div>
        </div>
    )

    const statusSection = (
        <C4StatusBanner
            isFinished={isFinished}
            winnerName={winnerName}
            isDraw={isDraw}
            currentDisc={gameData.currentDisc}
            currentPlayerName={currentPlayerName}
            secs={timeLeft}
            moveCount={gameData.moveCount}
            turnTimerLimit={turnTimerLimit}
            isSpectator={isSpectator}
            t={t}
        />
    )

    const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

    const historySection = (
        <div className="ttt-history-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('game.ui.moves')}</h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {moveHistory.length}/42
                </span>
            </div>
            <div className="ttt-history-list">
                {moveHistory.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.connect_four.game.noMovesYet')}</div>
                    : moveHistory.slice().reverse().map((m: ConnectFourMoveRecord, index) => (
                        <div key={`${m.timestamp}-${m.col}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bd-card-warm)' }}>
                            <span style={{ color: 'var(--bd-ink-muted)', width: 22, fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>
                                #{String(moveHistory.length - index).padStart(2, '0')}
                            </span>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: m.disc === 1 ? DISC_RED : DISC_YELLOW, flexShrink: 0, boxShadow: '0 0 0 1.5px var(--bd-ink)' }} />
                            <span style={{ color: 'var(--bd-ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {m.disc === 1 ? p1Name : p2Name}
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: 12, fontFamily: 'ui-monospace,monospace', fontWeight: 700, flexShrink: 0, color: 'var(--bd-ink)' }}>
                                col {COLUMN_LABELS[m.col]}
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

    const boardDisabled = isSpectator || !isMyTurn() || isFinished || isMoveSubmitting || !!pendingRequest

    const renderBoardSection = () => (
        <div className="ttt-board-card" style={{ position: 'relative' }}>
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
            {isFinished && !isSpectator && (
                <div className="ttt-board-overlay" style={{ borderRadius: 16 }}>
                    <C4ResultOverlay
                        winnerName={winnerName}
                        isDraw={isDraw}
                        isMyWin={isMyWin}
                        onPlayAgain={handlePlayAgain}
                        onReturnToLobby={handleReturnToWaiting}
                        onLeave={() => setShowLeaveConfirmModal(true)}
                        isLoading={isRematchSubmitting}
                        isHost={!!lobby && lobby.creatorId === currentUserId}
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
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <button
                onClick={() => void handleRequestUndo()}
                disabled={!canRequestUndo}
                style={{ padding: '10px 14px', fontSize: 13, borderRadius: 14, fontWeight: 600, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: canRequestUndo ? 'var(--bd-ink-soft)' : 'var(--bd-ink-muted)', cursor: canRequestUndo ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: canRequestUndo ? 1 : 0.5, width: isMobile ? '100%' : undefined }}
            >
                ↶ {t('games.connect_four.game.requestUndo')}
            </button>
            <button onClick={() => setShowLeaveConfirmModal(true)} style={{ padding: '10px 14px', fontSize: 13, borderRadius: 14, fontWeight: 600, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-coral-deep)', cursor: 'pointer', fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}>
                {t('games.connect_four.game.leave')}
            </button>
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
                            <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: msg.color === 'coral' ? 'var(--bd-coral)' : msg.color === 'sun' ? 'var(--bd-sun)' : 'var(--bd-sky)', display: 'grid', placeItems: 'center', fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 10, color: 'white' }}>
                                {msg.who.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                    <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--bd-ink)' }}>{msg.who}</span>
                                    <span style={{ fontSize: 9, color: 'var(--bd-ink-muted)' }}>{msg.time}</span>
                                </div>
                                <div style={{ background: 'var(--bd-card-warm)', padding: '5px 9px', borderRadius: 8, fontSize: 12, lineHeight: 1.35, display: 'inline-block', maxWidth: '100%', wordBreak: 'break-word', marginTop: 2, color: 'var(--bd-ink)' }}>
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    ))
                }
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--bd-line)' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                    {['gg', 'nice', '😂', '🔥', '🤝'].map(e => (
                        <button key={e} onClick={() => quickReact(e)} style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', fontSize: 11, cursor: 'pointer', fontWeight: 600, color: 'var(--bd-ink-soft)', fontFamily: 'inherit' }}>{e}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        style={{ flex: 1, padding: '8px 10px', fontSize: 12, border: '2px solid var(--bd-line)', borderRadius: 12, background: 'var(--bd-bg)', outline: 'none', fontFamily: 'inherit', color: 'var(--bd-ink)' }}
                        placeholder={t('game.ui.chatPlaceholder')}
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendChat()}
                    />
                    <button onClick={sendChat} aria-label={t('chat.send')} style={{ padding: '8px 12px', borderRadius: 14, background: 'var(--bd-ink)', color: 'var(--bd-bg)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 4px 0 var(--bd-coral)', fontFamily: 'inherit' }}>↗</button>
                </div>
            </div>
        </div>
    )

    const themeStyle = getThemePageStyle(lobby.theme)

    return (
        <div className="ttt-screen" style={themeStyle}>
            {/* ── DESKTOP ─────────────────────────────────────────────────── */}
            <div className="ttt-desktop-layout">
                <div className="ttt-grid">
                    <div className="ttt-center-col">
                        {headerSection}
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
