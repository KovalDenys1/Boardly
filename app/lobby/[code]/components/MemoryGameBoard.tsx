'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Move, Player } from '@/lib/game-engine'
import type { MemoryCard, MemoryGameData } from '@/lib/games/memory-game'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import LoadingSpinner from '@/components/LoadingSpinner'

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
  data?: MemoryGameData
}

interface MemoryGameBoardProps {
  gameId: string
  lobbyCode: string
  state: unknown
  players: LobbyPlayer[]
  currentUserId: string | null | undefined
}

const MISMATCH_RESOLVE_DELAY_MS = 1200

function getPlayerDisplayName(player: LobbyPlayer): string {
  return player.user?.username || player.user?.name || player.name || player.user?.email || 'Player'
}

function getDifficultyLabel(
  difficulty: MemoryGameData['difficulty'] | undefined,
  t: (key: any, options?: any) => string,
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

  const submitMove = useCallback(
    async (move: Pick<Move, 'type' | 'data'>) => {
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
          }),
        })

        const payload = await res.json().catch(() => null)

        if (!res.ok) {
          const isExpectedRaceError =
            payload?.code === 'TURN_ALREADY_ENDED' ||
            payload?.code === 'TURN_TIMER_ACTIVE' ||
            payload?.code === 'AUTO_ACTION_DEBOUNCED'

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
      void submitMove({ type: 'resolve-mismatch', data: {} })
    }, MISMATCH_RESOLVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentPlayerId, isMyTurn, pendingMismatchCardIds, submitMove])

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

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <section className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-white">🧠 {t('games.memory.name')}</h2>
              <p className="text-sm text-white/70">
                {t('games.memory.game.lobbyLabel', { code: lobbyCode.toUpperCase() })} · {difficultyLabel}
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90">
              {statusMessage}
            </div>
          </div>

          {winnerMessage && (
            <div className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100">
              {t('games.memory.game.finishedPrefix')} {winnerMessage}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/75">{t('games.memory.game.scoreboardTitle')}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(parsedState.players || []).map((player) => {
              const score = scoreByPlayerId[player.id] ?? player.score ?? 0
              const isCurrent = player.id === currentPlayerId
              return (
                <div
                  key={player.id}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    isCurrent ? 'border-cyan-300/45 bg-cyan-500/15 text-cyan-100' : 'border-white/15 bg-white/5 text-white/85'
                  }`}
                >
                  <p className="truncate font-semibold">{displayNameByUserId.get(player.id) || player.name || t('games.memory.game.unknownPlayer')}</p>
                  <p className="text-xs opacity-80">{t('games.memory.game.pairsLabel', { count: score })}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-3 sm:p-4 backdrop-blur-md">
          <div
            className="grid gap-2 sm:gap-3"
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
                  className={`relative aspect-square [perspective:1000px] focus:outline-none ${
                    isDisabled ? 'cursor-default' : 'cursor-pointer'
                  }`}
                >
                  <span
                    className={`absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] ${
                      isFaceUp ? '[transform:rotateY(180deg)]' : ''
                    }`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-slate-800/70 text-xl font-black text-white/70 [backface-visibility:hidden]">
                      ?
                    </span>
                    <span
                      className={`absolute inset-0 flex items-center justify-center rounded-xl border [backface-visibility:hidden] [transform:rotateY(180deg)] ${symbolSizeClass} ${
                        card.isMatched
                          ? 'border-emerald-300/50 bg-emerald-500/25 text-emerald-100'
                          : 'border-cyan-300/45 bg-cyan-500/20 text-white'
                      }`}
                    >
                      {card.value}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
