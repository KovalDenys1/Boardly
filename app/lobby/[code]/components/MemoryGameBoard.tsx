'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Move, Player } from '@/lib/game-engine'
import type { MemoryCard, MemoryGameData } from '@/lib/games/memory-game'
import type { ChatMessagePayload } from '@/types/game'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import LoadingSpinner from '@/components/LoadingSpinner'
import Chat from '@/components/Chat'
import { useGameTimer } from '../hooks/useGameTimer'
import { sounds } from '@/lib/sounds'

interface LobbyPlayer {
  id: string
  userId: string
  score: number
  user?: {
    username?: string | null
    name?: string | null
    email?: string | null
    image?: string | null
    avatarUrl?: string | null
    isPremium?: boolean
    bot?: unknown
  } | null
  name?: string | null
}

interface MemoryState {
  status: 'waiting' | 'playing' | 'finished' | string
  currentPlayerIndex: number
  players: Player[]
  lastMoveAt?: number
  updatedAt?: Date | string | number
  data?: MemoryGameData
}

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

interface MemoryGameBoardProps {
  gameId: string
  lobbyCode: string
  state: unknown
  players: LobbyPlayer[]
  currentUserId: string | null | undefined
  turnTimerLimit?: number
  canStartGame?: boolean
  onPlayAgain?: () => void
  onReturnToWaiting?: () => void
  onLeave?: () => void
  chatMessages?: ChatMessagePayload[]
  onSendChatMessage?: (message: string) => void
  chatUnreadCount?: number
  someoneTyping?: boolean
  playerProfiles?: Map<string, { avatarUrl?: string | null; isPremium?: boolean }>
  onProfileClick?: (userId: string) => void
}

const MISMATCH_RESOLVE_DELAY_MS = 1200

function getPlayerDisplayName(player: LobbyPlayer): string {
  return player.user?.username || player.user?.name || player.name || 'Player'
}

function getDifficultyLabel(
  difficulty: MemoryGameData['difficulty'] | undefined,
  t: (key: TranslationKeys, options?: string | Record<string, unknown>) => string,
): string {
  if (difficulty === 'medium') return t('lobby.create.difficultyMedium')
  if (difficulty === 'hard') return t('lobby.create.difficultyHard')
  return t('lobby.create.difficultyEasy')
}

type MobileTab = 'board' | 'score' | 'chat'

interface MemoryResultModalProps {
  winnerId: string | null | undefined
  winnerName: string
  isDraw: boolean
  isMyWin: boolean
  canStartGame: boolean
  onPlayAgain?: () => void
  onReturnToWaiting?: () => void
  onLeave?: () => void
  onInspect: () => void
  t: (key: TranslationKeys, opts?: string | Record<string, unknown>) => string
}

function MemoryResultModal({
  winnerId,
  winnerName,
  isDraw,
  isMyWin,
  canStartGame,
  onPlayAgain,
  onReturnToWaiting,
  onLeave,
  onInspect,
  t,
}: MemoryResultModalProps) {
  const ghostBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 14,
    border: '1.5px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '0 20px',
    transition: 'background 0.12s',
    width: '100%',
  }

  const title = isDraw
    ? t('games.memory.game.tieLabel')
    : isMyWin
      ? t('lobby.game.playAgain').replace('Play Again', 'You win!')  // fallback
      : t('games.memory.game.winnerLabel', { player: winnerName })

  const displayTitle = isDraw
    ? t('games.memory.game.tieLabel')
    : isMyWin
      ? '🎉 You win!'
      : t('games.memory.game.winnerLabel', { player: winnerName })

  void title

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        background: 'rgba(31,27,22,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '20px 16px',
        zIndex: 10,
      }}
    >
      <p
        style={{
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.45)',
          margin: 0,
          textTransform: 'uppercase',
        }}
      >
        ROUND OVER
      </p>

      {isDraw ? (
        <span style={{ fontSize: 48, lineHeight: 1 }}>🤝</span>
      ) : (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--bd-mint)',
            border: '2px solid rgba(31,27,22,0.6)',
            boxShadow: '0 5px 0 rgba(31,27,22,0.25)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 26,
          }}
        >
          🏆
        </div>
      )}

      <h2
        style={{
          fontFamily: 'var(--bd-font-display)',
          fontSize: 'clamp(22px, 4vw, 32px)',
          fontWeight: 800,
          color: '#fff',
          margin: 0,
          lineHeight: 1.1,
          textAlign: 'center',
        }}
      >
        {displayTitle}
      </h2>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: '100%',
          maxWidth: 260,
        }}
      >
        <button style={ghostBtn} onClick={onInspect}>
          {t('games.memory.game.viewBoard')}
        </button>

        {canStartGame && onPlayAgain && (
          <button
            style={{
              ...ghostBtn,
              background: 'var(--bd-mint)',
              color: '#fff',
              border: '1.5px solid var(--bd-mint)',
              boxShadow: '0 4px 0 var(--bd-mint-deep)',
            }}
            onClick={onPlayAgain}
          >
            {t('lobby.game.playAgain')}
          </button>
        )}

        {canStartGame && onReturnToWaiting && (
          <button style={ghostBtn} onClick={onReturnToWaiting}>
            {t('game.ui.returnToLobby')}
          </button>
        )}

        {!canStartGame && (
          <p
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 13,
              textAlign: 'center',
              margin: 0,
            }}
          >
            {t('game.ui.waitingForHost')}
          </p>
        )}

        {onLeave && (
          <button style={ghostBtn} onClick={onLeave}>
            {t('game.ui.leave')}
          </button>
        )}
      </div>
    </div>
  )
}

function MemoryPlayerCard({
  displayName,
  score,
  isActive,
  isWinner,
  side,
  avatarSrc,
  isPremium,
  t,
}: {
  displayName: string
  score: number
  isActive: boolean
  isWinner: boolean
  side: 'left' | 'right'
  avatarSrc?: string | null
  isPremium?: boolean
  t: (key: TranslationKeys, opts?: string | Record<string, unknown>) => string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 14,
      background: isActive ? 'white' : 'transparent',
      border: '2px solid ' + (isActive ? 'var(--bd-ink)' : 'transparent'),
      boxShadow: isActive ? '0 4px 0 var(--bd-ink)' : 'none',
      flexDirection: side === 'right' ? 'row-reverse' : 'row',
      transition: 'all 0.2s', minWidth: 0,
    }}>
      {avatarSrc ? (
        <img src={avatarSrc} alt={displayName} style={{
          width: 42, height: 42, borderRadius: '50%', objectFit: 'cover',
          border: '2px solid white', boxShadow: '0 0 0 2px var(--bd-ink)', flexShrink: 0,
        }} />
      ) : (
        <div style={{
          width: 42, height: 42, borderRadius: '50%', background: 'var(--bd-mint)',
          display: 'grid', placeItems: 'center', border: '2px solid white',
          boxShadow: '0 0 0 2px var(--bd-ink)',
          fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 18, color: 'white', flexShrink: 0,
        }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ textAlign: side === 'right' ? 'right' : 'left', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}>
          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isPremium ? 'var(--bd-premium)' : undefined }}>
            {displayName}
          </span>
          {isPremium && <span style={{ fontSize: 12, flexShrink: 0 }} title="Premium">👑</span>}
          {isWinner && (
            <span style={{
              display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700,
              background: 'var(--bd-sun)', color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)',
              boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)', whiteSpace: 'nowrap',
            }}>{t('games.memory.game.victoryBadge')}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--bd-ink-muted)', marginTop: 1 }}>
          {t('games.memory.game.pairsLabel', { count: score })}
        </div>
        {isActive && (
          <div style={{
            marginTop: 2, fontSize: 10, color: 'var(--bd-ink)', fontWeight: 600,
            display: 'flex', gap: 4, alignItems: 'center',
            justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--bd-mint-deep)', display: 'inline-block' }} />
            {t('game.ui.yourTurn')}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoryStatusBanner({
  isFinished,
  winnerName,
  isDraw,
  currentPlayerName,
  secs,
  turnTimerLimit,
  matchedPairs,
  totalPairs,
  t,
}: {
  isFinished: boolean
  winnerName: string | null
  isDraw: boolean
  currentPlayerName: string
  secs: number
  turnTimerLimit: number
  matchedPairs: number
  totalPairs: number
  t: (key: TranslationKeys, opts?: string | Record<string, unknown>) => string
}) {
  if (isFinished && !isDraw && winnerName) {
    return (
      <div style={{
        padding: '10px 16px', borderRadius: 14, background: 'var(--bd-ink)', color: 'var(--bd-bg)',
        display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 0 var(--bd-mint-deep)',
      }}>
        <span style={{
          display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: 'var(--bd-sun)', color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)',
          boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)',
        }}>{t('games.memory.game.victoryBadge')}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{t('games.memory.game.winnerLabel', { player: winnerName })}</span>
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
        }}>{t('games.memory.game.drawBadge')}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{t('games.memory.game.tieLabel')}</span>
      </div>
    )
  }
  const pct = turnTimerLimit > 0 ? (secs / turnTimerLimit) * 100 : 100
  const danger = secs <= 10
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 14, background: 'var(--bd-bg)',
      border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {t('games.memory.game.playerTurnBanner', { player: currentPlayerName })}
          <span style={{ color: 'var(--bd-ink-muted)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>
            {matchedPairs}/{totalPairs}
          </span>
        </div>
        <div style={{ marginTop: 6, height: 5, background: 'var(--bd-bg2)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: pct + '%',
            background: danger ? 'var(--bd-coral)' : 'var(--bd-mint)',
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

export default function MemoryGameBoard({
  gameId,
  lobbyCode,
  state,
  players,
  currentUserId,
  turnTimerLimit: rawTurnTimerLimit,
  canStartGame,
  onPlayAgain,
  onReturnToWaiting,
  onLeave,
  chatMessages = [],
  onSendChatMessage,
  chatUnreadCount = 0,
  someoneTyping = false,
  playerProfiles,
  onProfileClick,
}: MemoryGameBoardProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [optimisticFlippedIds, setOptimisticFlippedIds] = useState<string[]>([])
  const [mobileTab, setMobileTab] = useState<MobileTab>('board')
  const [overlayInspecting, setOverlayInspecting] = useState(false)
  const resolveKeyRef = useRef<string | null>(null)

  const parsedState = (state || {}) as MemoryState
  const gameData = parsedState.data
  const cards = Array.isArray(gameData?.cards) ? (gameData.cards as MemoryCard[]) : []
  const flippedCardIds = Array.isArray(gameData?.flippedCardIds) ? gameData.flippedCardIds : []
  const pendingMismatchCardIds = useMemo(
    () =>
      Array.isArray(gameData?.pendingMismatchCardIds)
        ? gameData.pendingMismatchCardIds
        : [],
    [gameData?.pendingMismatchCardIds]
  )

  const gridColumns =
    typeof gameData?.gridColumns === 'number' && Number.isFinite(gameData.gridColumns)
      ? gameData.gridColumns
      : 4

  const scoreByPlayerId = gameData?.scores || {}
  const currentPlayerId = parsedState.players?.[parsedState.currentPlayerIndex]?.id || null
  const isMyTurn = !!currentUserId && currentUserId === currentPlayerId && parsedState.status === 'playing'
  const isFinished = parsedState.status === 'finished'
  const turnTimerLimit =
    typeof rawTurnTimerLimit === 'number' && Number.isFinite(rawTurnTimerLimit) && rawTurnTimerLimit > 0
      ? Math.floor(rawTurnTimerLimit)
      : 60

  const displayNameByUserId = useMemo(() => {
    const result = new Map<string, string>()
    for (const player of players) {
      result.set(player.userId, getPlayerDisplayName(player))
    }
    for (const enginePlayer of parsedState.players || []) {
      if (!result.has(enginePlayer.id)) {
        result.set(enginePlayer.id, enginePlayer.name || 'Player')
      }
    }
    return result
  }, [players, parsedState.players])

  const premiumByUserId = useMemo(() => {
    const result = new Map<string, boolean>()
    for (const player of players) {
      result.set(player.userId, !!player.user?.isPremium)
    }
    return result
  }, [players])

  const avatarByUserId = useMemo(() => {
    const result = new Map<string, string | null>()
    for (const player of players) {
      result.set(player.userId, player.user?.avatarUrl ?? player.user?.image ?? null)
    }
    return result
  }, [players])

  useEffect(() => {
    if (optimisticFlippedIds.length === 0) return
    const confirmedIds = new Set([
      ...flippedCardIds,
      ...cards.filter((c) => c.isFlipped || c.isMatched).map((c) => c.id),
    ])
    setOptimisticFlippedIds((prev) => prev.filter((id) => !confirmedIds.has(id)))
  }, [flippedCardIds, cards]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitMoveRef = useRef<typeof submitMove | null>(null)

  const buildAutoActionContext = useCallback((playerId: string): AutoActionContext => {
    const lastMoveAt =
      typeof parsedState.lastMoveAt === 'number' && Number.isFinite(parsedState.lastMoveAt)
        ? parsedState.lastMoveAt
        : null
    const updatedAt =
      typeof parsedState.updatedAt === 'number' || typeof parsedState.updatedAt === 'string'
        ? parsedState.updatedAt
        : parsedState.updatedAt instanceof Date
          ? parsedState.updatedAt.toISOString()
          : null

    return {
      source: 'turn-timeout',
      debounceKey: `${gameId}:${playerId}:${parsedState.currentPlayerIndex}:${lastMoveAt ?? 'none'}`,
      turnSnapshot: {
        currentPlayerId: playerId,
        currentPlayerIndex: parsedState.currentPlayerIndex,
        lastMoveAt,
        rollsLeft: 0,
        updatedAt,
      },
    }
  }, [gameId, parsedState.currentPlayerIndex, parsedState.lastMoveAt, parsedState.updatedAt])

  const submitMove = useCallback(
    async (
      move: Pick<Move, 'type' | 'data'>,
      options?: { autoActionContext?: AutoActionContext }
    ) => {
      if (isSubmitting) return false

      setIsSubmitting(true)
      try {
        const res = await fetchWithGuest(`/api/game/${gameId}/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            move,
            autoActionContext: options?.autoActionContext,
          }),
        })

        const payload = await res.json().catch(() => null)

        if (!res.ok) {
          const isExpectedRaceError =
            payload?.code === 'TURN_ALREADY_ENDED' ||
            payload?.code === 'TURN_TIMER_ACTIVE' ||
            payload?.code === 'AUTO_ACTION_DEBOUNCED' ||
            payload?.code === 'STATE_CONFLICT'

          if (!isExpectedRaceError) {
            showToast.error('games.memory.game.moveFailed', undefined, {
              message:
                (typeof payload?.details === 'string' && payload.details) ||
                (typeof payload?.error === 'string' && payload.error) ||
                'Failed to submit move',
            })
          }

          return false
        }

        return true
      } catch (error) {
        showToast.errorFrom(error, 'games.memory.game.moveFailed')
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [gameId, isSubmitting]
  )

  useEffect(() => {
    submitMoveRef.current = submitMove
  }, [submitMove])

  const timerState =
    parsedState.status === 'playing' && pendingMismatchCardIds.length !== 2
      ? parsedState
      : null
  const { timeLeft } = useGameTimer({
    isMyTurn,
    gameState: timerState,
    turnTimerLimit,
    onTimeout: async (): Promise<boolean> => {
      if (!isMyTurn || !currentPlayerId || pendingMismatchCardIds.length === 2) {
        return true
      }

      const autoActionContext = buildAutoActionContext(currentPlayerId)
      const submitted = await submitMoveRef.current?.(
        { type: 'timeout-pass', data: {} },
        { autoActionContext }
      )

      return submitted ?? false
    },
  })

  useEffect(() => {
    if (!isMyTurn || pendingMismatchCardIds.length !== 2) {
      resolveKeyRef.current = null
      return
    }

    const resolveKey = `${currentPlayerId}:${pendingMismatchCardIds.join(':')}`
    if (resolveKeyRef.current === resolveKey) {
      return
    }

    resolveKeyRef.current = resolveKey

    const timer = window.setTimeout(() => {
      void submitMoveRef.current?.({ type: 'resolve-mismatch', data: {} })
    }, MISMATCH_RESOLVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentPlayerId, isMyTurn, pendingMismatchCardIds])

  const handleCardClick = useCallback(
    (cardId: string) => {
      if (!isMyTurn || isSubmitting || pendingMismatchCardIds.length > 0) {
        return
      }

      setOptimisticFlippedIds((prev) => [...prev, cardId])
      sounds.play('cardFlip', { force: true })

      void submitMove({ type: 'flip', data: { cardId } }).then((success) => {
        if (!success) {
          setOptimisticFlippedIds((prev) => prev.filter((id) => id !== cardId))
        }
      })
    },
    [isMyTurn, isSubmitting, pendingMismatchCardIds.length, submitMove]
  )

  if (!gameData || cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-bg2)] px-8 py-10 text-center">
          <LoadingSpinner size="md" />
          <p className="mt-4 text-sm text-bd-ink-muted">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const difficultyLabel = getDifficultyLabel(gameData.difficulty, t)
  const winnerId = gameData.winnerId
  const winnerName = (winnerId && displayNameByUserId.get(winnerId)) || t('games.memory.game.unknownPlayer')
  const isDraw = isFinished && !winnerId
  const isMyWin = isFinished && !!winnerId && !!currentUserId && winnerId === currentUserId
  const symbolSizeClass = gridColumns >= 6 ? 'text-lg sm:text-xl' : gridColumns === 5 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
  const matchedPairs = cards.filter((card) => card.isMatched).length / 2
  const totalPairs = Math.max(1, cards.length / 2)
  const currentPlayerName =
    (currentPlayerId && displayNameByUserId.get(currentPlayerId)) ||
    t('games.memory.game.unknownPlayer')

  const cardGrid = (
    <div
      className="memory-grid"
      style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
    >
      {cards.map((card) => {
        const isOptimisticallyFlipped = optimisticFlippedIds.includes(card.id)
        const isFaceUp = card.isFlipped || card.isMatched || isOptimisticallyFlipped
        const isDisabled =
          !isMyTurn ||
          isSubmitting ||
          parsedState.status !== 'playing' ||
          pendingMismatchCardIds.length > 0 ||
          flippedCardIds.length >= 2 ||
          card.isMatched ||
          card.isFlipped ||
          isOptimisticallyFlipped

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => handleCardClick(card.id)}
            disabled={isDisabled}
            className={`memory-tile ${isDisabled ? 'cursor-default' : 'cursor-pointer'} ${card.isMatched ? 'memory-tile-matched' : ''}`}
          >
            <span className={`memory-tile-inner ${isFaceUp ? 'memory-tile-inner-flipped' : ''}`}>
              <span className="memory-tile-back">
                <span className="memory-tile-back-mark">B</span>
              </span>
              <span className={`memory-tile-face ${symbolSizeClass}`}>
                {card.value}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )

  const scorePanel = (
    <div className="mt-3 space-y-2">
      {(parsedState.players || []).map((player) => {
        const score = scoreByPlayerId[player.id] ?? player.score ?? 0
        const isCurrent = player.id === currentPlayerId
        return (
          <div key={player.id} className={`memory-score-row ${isCurrent ? 'memory-score-row-active' : ''}`}>
            {avatarByUserId.get(player.id) ? (
              <img
                src={avatarByUserId.get(player.id)!}
                alt={displayNameByUserId.get(player.id) || '?'}
                className="h-9 w-9 shrink-0 rounded-xl border-2 border-bd-ink object-cover"
              />
            ) : (
              <span className="bd-avatar bd-avatar-sun h-9 w-9">
                {(displayNameByUserId.get(player.id) || player.name || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className={`flex items-center gap-1 truncate font-bold ${premiumByUserId.get(player.id) ? 'text-amber-500' : ''}`}>
                {displayNameByUserId.get(player.id) || player.name || t('games.memory.game.unknownPlayer')}
                {premiumByUserId.get(player.id) && <span className="shrink-0 text-xs" title="Premium">👑</span>}
              </p>
              <p className="text-xs font-semibold opacity-70">{t('games.memory.game.pairsLabel', { count: score })}</p>
            </div>
            <span className="text-lg font-black">{score}</span>
          </div>
        )
      })}
    </div>
  )

  const isTwoPlayer = (parsedState.players?.length ?? 0) === 2
  const player0 = parsedState.players?.[0] ?? null
  const player1 = parsedState.players?.[1] ?? null

  const headerSection = (
    <div className="memory-header" style={{
      background: 'linear-gradient(135deg, white 0%, rgba(79,201,166,0.08) 100%)',
    }}>
      {isTwoPlayer && player0 && player1 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
          <MemoryPlayerCard
            displayName={displayNameByUserId.get(player0.id) || 'Player 1'}
            score={scoreByPlayerId[player0.id] ?? 0}
            isActive={!isFinished && currentPlayerId === player0.id}
            isWinner={isFinished && !!winnerId && winnerId === player0.id}
            side="left"
            avatarSrc={avatarByUserId.get(player0.id) ?? null}
            isPremium={premiumByUserId.get(player0.id)}
            t={t}
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
              {difficultyLabel}
            </div>
            <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
              {matchedPairs}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>/</span>{totalPairs}
            </div>
            <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
              {t('games.memory.game.scoreboardTitle')}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <MemoryPlayerCard
              displayName={displayNameByUserId.get(player1.id) || 'Player 2'}
              score={scoreByPlayerId[player1.id] ?? 0}
              isActive={!isFinished && currentPlayerId === player1.id}
              isWinner={isFinished && !!winnerId && winnerId === player1.id}
              side="right"
              avatarSrc={avatarByUserId.get(player1.id) ?? null}
              isPremium={premiumByUserId.get(player1.id)}
              t={t}
            />
            {onLeave && (
              <button type="button" onClick={onLeave} aria-label={t('game.ui.leave')} className="memory-leave-button">
                <span aria-hidden>🚪</span>
                <span>{t('game.ui.leave')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(parsedState.players || []).map((player) => {
            const score = scoreByPlayerId[player.id] ?? 0
            const isActive = !isFinished && player.id === currentPlayerId
            const name = displayNameByUserId.get(player.id) || 'Player'
            const avatarSrc = avatarByUserId.get(player.id) ?? null
            const isPremium = premiumByUserId.get(player.id) ?? false
            const isWinnerCard = isFinished && !!winnerId && winnerId === player.id
            return (
              <div key={player.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 12,
                background: isActive ? 'white' : 'transparent',
                border: '2px solid ' + (isActive ? 'var(--bd-ink)' : 'var(--bd-line)'),
                boxShadow: isActive ? '0 3px 0 var(--bd-ink)' : 'none',
                flex: '1 1 auto', minWidth: 0, transition: 'all 0.2s',
              }}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt={name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--bd-ink)' }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bd-mint)', display: 'grid', placeItems: 'center', flexShrink: 0, border: '2px solid var(--bd-ink)', fontWeight: 700, fontSize: 14, color: 'white', fontFamily: 'var(--bd-font-display)' }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isPremium ? 'var(--bd-premium)' : undefined }}>
                    {name}{isPremium ? ' 👑' : ''}{isWinnerCard ? ' 🏆' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bd-ink-muted)' }}>{t('games.memory.game.pairsLabel', { count: score })}</div>
                </div>
                {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bd-mint-deep)', flexShrink: 0 }} />}
              </div>
            )
          })}
          {onLeave && (
            <button type="button" onClick={onLeave} aria-label={t('game.ui.leave')} className="memory-leave-button" style={{ flexShrink: 0 }}>
              <span aria-hidden>🚪</span>
              <span>{t('game.ui.leave')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )

  const statusSection = (
    <MemoryStatusBanner
      isFinished={isFinished}
      winnerName={winnerName}
      isDraw={isDraw}
      currentPlayerName={currentPlayerName}
      secs={timeLeft}
      turnTimerLimit={turnTimerLimit}
      matchedPairs={matchedPairs}
      totalPairs={totalPairs}
      t={t}
    />
  )

  return (
    <div className="memory-screen">
      {/* ── Desktop layout ─────────────────────────────── */}
      <div className="memory-desktop-layout">
        <div className="memory-shell">
          {headerSection}
          {statusSection}

          <main className="memory-layout">
            <section className="memory-board-panel" style={{ position: 'relative' }}>
              {cardGrid}
              {isFinished && !overlayInspecting && (
                <MemoryResultModal
                  winnerId={winnerId}
                  winnerName={winnerName}
                  isDraw={isDraw}
                  isMyWin={isMyWin}
                  canStartGame={!!canStartGame}
                  onPlayAgain={onPlayAgain}
                  onReturnToWaiting={canStartGame ? onReturnToWaiting : undefined}
                  onLeave={onLeave}
                  onInspect={() => setOverlayInspecting(true)}
                  t={t}
                />
              )}
              {isFinished && overlayInspecting && (
                <button
                  onClick={() => setOverlayInspecting(false)}
                  style={{
                    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(31,27,22,0.75)', color: '#fff',
                    border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 20,
                    padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    zIndex: 5, backdropFilter: 'blur(4px)',
                  }}
                >
                  {t('games.memory.game.showResults')}
                </button>
              )}
            </section>

            <aside className="memory-side-stack">
              <section className="memory-score-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                  <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('games.memory.game.scoreboardTitle')}</h3>
                  <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {matchedPairs}/{totalPairs}
                  </span>
                </div>
                {scorePanel}
              </section>

              {onSendChatMessage && (
                <section className="memory-chat-panel">
                  <Chat
                    messages={chatMessages}
                    onSendMessage={onSendChatMessage}
                    currentUserId={currentUserId || null}
                    isMinimized={false}
                    onToggleMinimize={() => {}}
                    unreadCount={chatUnreadCount}
                    someoneTyping={someoneTyping}
                    playerProfiles={playerProfiles}
                    onProfileClick={onProfileClick}
                    fullScreen
                  />
                </section>
              )}
            </aside>
          </main>
        </div>
      </div>

      {/* ── Mobile layout ──────────────────────────────── */}
      <div className="memory-mobile-layout">
        {/* Compact player chips header */}
        <div className="memory-mobile-header">
          <div style={{ display: 'flex', flex: 1, minWidth: 0, gap: 6, overflow: 'hidden' }}>
            {(parsedState.players || []).map((player) => {
              const score = scoreByPlayerId[player.id] ?? 0
              const isActive = !isFinished && player.id === currentPlayerId
              const name = displayNameByUserId.get(player.id) || 'Player'
              const avatarSrc = avatarByUserId.get(player.id) ?? null
              return (
                <div key={player.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 10,
                  background: isActive ? 'white' : 'var(--bd-bg2)',
                  border: '1.5px solid ' + (isActive ? 'var(--bd-ink)' : 'var(--bd-line)'),
                  boxShadow: isActive ? '0 2px 0 var(--bd-ink)' : 'none',
                  flex: '1 1 0', minWidth: 0, transition: 'all 0.2s',
                }}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid var(--bd-ink)' }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bd-mint)', display: 'grid', placeItems: 'center', flexShrink: 0, border: '1.5px solid var(--bd-ink)', fontWeight: 700, fontSize: 10, color: 'white' }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)' }}>{score}p</div>
                  </div>
                </div>
              )
            })}
          </div>
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              aria-label={t('game.ui.leave')}
              className="memory-leave-button"
              style={{ minHeight: 36, padding: '6px 10px', fontSize: 12, flexShrink: 0 }}
            >
              <span aria-hidden>🚪</span>
            </button>
          )}
        </div>

        {/* Status banner */}
        <div style={{ flexShrink: 0, padding: '4px 12px' }}>
          {statusSection}
        </div>

        {/* Tabs */}
        <div className="memory-tabs">
          <button
            className={`memory-tab-btn ${mobileTab === 'board' ? 'memory-tab-btn-active' : ''}`}
            onClick={() => setMobileTab('board')}
          >
            {t('games.memory.game.tabBoard')}
          </button>
          <button
            className={`memory-tab-btn ${mobileTab === 'score' ? 'memory-tab-btn-active' : ''}`}
            onClick={() => setMobileTab('score')}
          >
            {t('games.memory.game.tabScore')} ({matchedPairs}/{totalPairs})
          </button>
          {onSendChatMessage && (
            <button
              className={`memory-tab-btn ${mobileTab === 'chat' ? 'memory-tab-btn-active' : ''}`}
              onClick={() => setMobileTab('chat')}
            >
              {t('games.memory.game.tabChat')}
              {chatUnreadCount > 0 && mobileTab !== 'chat' && (
                <span className="memory-tab-badge">{chatUnreadCount}</span>
              )}
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="memory-mobile-content">
          {mobileTab === 'board' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 12px' }}>
              <div className="memory-mobile-board-wrap" style={{ position: 'relative' }}>
                {cardGrid}
                {isFinished && !overlayInspecting && (
                  <MemoryResultModal
                    winnerId={winnerId}
                    winnerName={winnerName}
                    isDraw={isDraw}
                    isMyWin={isMyWin}
                    canStartGame={!!canStartGame}
                    onPlayAgain={onPlayAgain}
                    onReturnToWaiting={canStartGame ? onReturnToWaiting : undefined}
                    onLeave={onLeave}
                    onInspect={() => setOverlayInspecting(true)}
                    t={t}
                  />
                )}
                {isFinished && overlayInspecting && (
                  <button
                    onClick={() => setOverlayInspecting(false)}
                    style={{
                      position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(31,27,22,0.75)', color: '#fff',
                      border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 20,
                      padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      zIndex: 5, backdropFilter: 'blur(4px)', whiteSpace: 'nowrap',
                    }}
                  >
                    {t('games.memory.game.showResults')}
                  </button>
                )}
              </div>
            </div>
          )}

          {mobileTab === 'score' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: '0 0 12px' }}>{t('games.memory.game.scoreboardTitle')}</h3>
              {scorePanel}
              {isFinished && canStartGame && (
                <div className="mt-3 flex flex-col gap-2">
                  {onPlayAgain && (
                    <button onClick={onPlayAgain} className="bd-btn bd-btn-primary w-full justify-center">
                      {t('lobby.game.playAgain')}
                    </button>
                  )}
                  {onReturnToWaiting && (
                    <button onClick={onReturnToWaiting} className="bd-btn bd-btn-soft w-full justify-center">
                      {t('game.ui.returnToLobby')}
                    </button>
                  )}
                </div>
              )}
              {isFinished && !canStartGame && (
                <p className="mt-3 text-center text-sm font-semibold text-[var(--bd-ink-muted)]">{t('game.ui.waitingForHost')}</p>
              )}
            </div>
          )}

          {mobileTab === 'chat' && onSendChatMessage && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <Chat
                messages={chatMessages}
                onSendMessage={onSendChatMessage}
                currentUserId={currentUserId || null}
                isMinimized={false}
                onToggleMinimize={() => {}}
                unreadCount={chatUnreadCount}
                someoneTyping={someoneTyping}
                playerProfiles={playerProfiles}
                onProfileClick={onProfileClick}
                fullScreen
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
