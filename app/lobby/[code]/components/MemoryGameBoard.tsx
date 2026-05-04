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

interface LobbyPlayer {
  id: string
  userId: string
  score: number
  user?: {
    username?: string | null
    name?: string | null
    email?: string | null
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
  onLeave?: () => void
  chatMessages?: ChatMessagePayload[]
  onSendChatMessage?: (message: string) => void
  chatUnreadCount?: number
  someoneTyping?: boolean
}

const MISMATCH_RESOLVE_DELAY_MS = 1200

function getPlayerDisplayName(player: LobbyPlayer): string {
  return player.user?.username || player.user?.name || player.name || player.user?.email || 'Player'
}

function getDifficultyLabel(
  difficulty: MemoryGameData['difficulty'] | undefined,
  t: (key: TranslationKeys, options?: string | Record<string, unknown>) => string,
): string {
  if (difficulty === 'medium') return t('lobby.create.difficultyMedium')
  if (difficulty === 'hard') return t('lobby.create.difficultyHard')
  return t('lobby.create.difficultyEasy')
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
  onLeave,
  chatMessages = [],
  onSendChatMessage,
  chatUnreadCount = 0,
  someoneTyping = false,
}: MemoryGameBoardProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
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
          headers: {
            'Content-Type': 'application/json',
          },
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

  // Keep a stable ref so the mismatch timer always calls the latest submitMove
  // without re-triggering the effect when isSubmitting toggles mid-flip.
  useEffect(() => {
    submitMoveRef.current = submitMove
  }, [submitMove])

  const timerState =
    parsedState.status === 'playing' && pendingMismatchCardIds.length !== 2
      ? parsedState
      : null
  const { timeLeft, timerActive } = useGameTimer({
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

      void submitMove({
        type: 'flip',
        data: { cardId },
      })
    },
    [isMyTurn, isSubmitting, pendingMismatchCardIds.length, submitMove]
  )

  if (!gameData || cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-white/20 bg-white/10 px-8 py-10 text-center">
          <LoadingSpinner size="md" />
          <p className="mt-4 text-sm text-white/70">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const difficultyLabel = getDifficultyLabel(gameData.difficulty, t)
  const statusMessage =
    pendingMismatchCardIds.length === 2
      ? t('games.memory.game.resolvingMismatch')
      : isMyTurn
        ? t('games.memory.game.yourTurn')
        : t('games.memory.game.waitingForTurn', {
            player:
              (currentPlayerId && displayNameByUserId.get(currentPlayerId)) ||
              t('games.memory.game.unknownPlayer'),
          })

  const winnerId = gameData.winnerId
  const winnerMessage =
    parsedState.status === 'finished'
      ? winnerId
        ? t('games.memory.game.winnerLabel', {
            player: displayNameByUserId.get(winnerId) || t('games.memory.game.unknownPlayer'),
          })
        : t('games.memory.game.tieLabel')
      : null

  const symbolSizeClass = gridColumns >= 6 ? 'text-lg sm:text-xl' : gridColumns === 5 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
  const matchedPairs = cards.filter((card) => card.isMatched).length / 2
  const totalPairs = Math.max(1, cards.length / 2)
  const progressPercent = Math.min(100, Math.max(0, (matchedPairs / totalPairs) * 100))
  const timerPercent = Math.min(100, Math.max(0, (timeLeft / Math.max(1, turnTimerLimit)) * 100))
  const isTimerWarning = timerActive && parsedState.status === 'playing' && timeLeft <= 10
  const currentPlayerName =
    (currentPlayerId && displayNameByUserId.get(currentPlayerId)) ||
    t('games.memory.game.unknownPlayer')

  return (
    <div className="memory-screen">
      <div className="memory-shell">
        <header className="memory-header">
          <div className="min-w-0">
            <p className="bd-kicker">{t('games.memory.game.lobbyLabel', { code: lobbyCode.toUpperCase() })}</p>
            <h2 className="mt-1 truncate text-2xl font-black text-[var(--bd-ink)]">{t('games.memory.name')}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--bd-ink-muted)]">{difficultyLabel}</p>
          </div>
          <div className="memory-header-actions">
            <div className="memory-status">
              <span className={`bd-live-dot ${parsedState.status === 'finished' ? 'opacity-0' : ''}`} />
              <span>{statusMessage}</span>
            </div>
            <div className={`memory-turn-timer ${isTimerWarning ? 'memory-turn-timer-warning' : ''}`}>
              <span className="font-black tabular-nums">{timeLeft}s</span>
              <span className="memory-turn-timer-track" aria-hidden>
                <span style={{ width: `${timerPercent}%` }} />
              </span>
            </div>
            {onLeave && (
              <button
                type="button"
                onClick={onLeave}
                aria-label={t('game.ui.leave')}
                className="memory-leave-button"
              >
                <span aria-hidden>🚪</span>
                <span>{t('game.ui.leave')}</span>
              </button>
            )}
          </div>
        </header>

        <section className="memory-progress-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--bd-ink)]">{currentPlayerName}</p>
              <p className="text-xs font-semibold text-[var(--bd-ink-muted)]">{t('games.memory.game.pairsLabel', { count: matchedPairs })}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-black text-[var(--bd-ink)]">{matchedPairs}/{totalPairs}</p>
              <p className="text-xs font-semibold text-[var(--bd-ink-muted)]">{t('games.memory.game.scoreboardTitle')}</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bd-bg2)]">
            <div className="h-full rounded-full bg-[var(--bd-mint)] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>

          {winnerMessage && (
            <div className="mt-3 rounded-xl border border-[rgba(47,167,135,0.25)] bg-[rgba(79,201,166,0.16)] px-3 py-2 text-sm font-bold text-[var(--bd-mint-deep)]">
              {t('games.memory.game.finishedPrefix')} {winnerMessage}
            </div>
          )}

          {parsedState.status === 'finished' && onPlayAgain && (
            <div className="mt-3">
              {canStartGame ? (
                <button onClick={onPlayAgain} className="bd-btn bd-btn-primary w-full justify-center">
                  {t('lobby.game.playAgain')}
                </button>
              ) : (
                <p className="text-center text-sm font-semibold text-[var(--bd-ink-muted)]">{t('game.ui.waitingForHost')}</p>
              )}
            </div>
          )}
        </section>

        <main className="memory-layout">
          <section className="memory-board-panel">
            <div
              className="memory-grid"
              style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
            >
              {cards.map((card) => {
                const isFaceUp = card.isFlipped || card.isMatched
                const isDisabled =
                  !isMyTurn ||
                  isSubmitting ||
                  parsedState.status !== 'playing' ||
                  pendingMismatchCardIds.length > 0 ||
                  flippedCardIds.length >= 2 ||
                  card.isMatched ||
                  card.isFlipped

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
          </section>

          <aside className="memory-side-stack">
            <section className="memory-score-panel">
              <h3 className="spy-section-title">{t('games.memory.game.scoreboardTitle')}</h3>
              <div className="mt-3 space-y-2">
                {(parsedState.players || []).map((player) => {
                  const score = scoreByPlayerId[player.id] ?? player.score ?? 0
                  const isCurrent = player.id === currentPlayerId
                  return (
                    <div key={player.id} className={`memory-score-row ${isCurrent ? 'memory-score-row-active' : ''}`}>
                      <span className="bd-avatar bd-avatar-sun h-9 w-9">
                        {(displayNameByUserId.get(player.id) || player.name || '?').charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{displayNameByUserId.get(player.id) || player.name || t('games.memory.game.unknownPlayer')}</p>
                        <p className="text-xs font-semibold opacity-70">{t('games.memory.game.pairsLabel', { count: score })}</p>
                      </div>
                      <span className="text-lg font-black">{score}</span>
                    </div>
                  )
                })}
              </div>
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
                  fullScreen
                />
              </section>
            )}
          </aside>
        </main>
      </div>
    </div>
  )
}
