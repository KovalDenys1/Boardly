'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import type { Move, Player } from '@/lib/game-engine'
import type { MemoryCard, MemoryGameData, MemoryMoveRecord } from '@/lib/games/memory-game'
import type { ChatMessagePayload } from '@/types/game'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import Chat from '@/components/Chat'
import GameResultOverlay, { RESULT_REVEAL_DELAY_MS } from '@/components/game-chrome/GameResultOverlay'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import { reportablePlayerId } from '@/lib/reportable-player'
import GameScoreboardHeader, { type GameHeaderRoom } from '@/components/game-chrome/GameScoreboardHeader'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import { hasTopScore, viewerOutcome } from '@/lib/game-outcome'
import GameTabs from '@/components/game-chrome/GameTabs'
import { useGameTimer } from '../hooks/useGameTimer'
import { useActiveGameLayout, type ActiveGameLayout } from '@/hooks/useActiveGameLayout'
import { playCue } from '@/lib/sound-engine'
import { useMemorySounds } from '../hooks/useMemorySounds'
import { useSpectatorResultCue } from '@/hooks/useSpectatorResultCue'
import ScorePop from '@/components/game-chrome/ScorePop'
import { MemoryCardTile, MemoryGrid, memorySymbolSizeClass } from '@/components/boards/MemoryTiles'
import { MATCH_CUE_MS, idsAddedSince, matchedCardIds } from '@/lib/memory-motion'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'

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
  /** Whether the lobby admits spectators, so the header can offer the invite. */
  allowSpectators?: boolean
  chatMessages?: ChatMessagePayload[]
  onSendChatMessage?: (message: string) => void | Promise<string | null>
  /** False puts the terms consent panel in place of the chat composer (#1466). */
  chatTermsAccepted?: boolean | null
  onAcceptChatTerms?: () => Promise<boolean>
  chatUnreadCount?: number
  someoneTyping?: boolean
  playerProfiles?: Map<string, { avatarUrl?: string | null; isPremium?: boolean }>
  onProfileClick?: (userId: string) => void
  isGuest?: boolean
  isSpectator?: boolean
  /** Play Again / Return to Lobby in-flight — disables the overlay actions (#736 phase 2, fixes the double-submit gap). */
  isRestarting?: boolean
  /**
   * Fetches a fresh authoritative snapshot from the server (bypassing
   * realtime broadcast). Used as a watchdog fallback: Supabase Broadcast is
   * fire-and-forget over a stateless REST POST with no delivery guarantee —
   * if the resolve-mismatch broadcast is dropped, pendingMismatchCardIds
   * never clears client-side and the board looks permanently frozen.
   */
  reconcileWithServerSnapshot?: () => Promise<void>
}

const MISMATCH_RESOLVE_DELAY_MS = 1200
const MISMATCH_RESOLVE_WATCHDOG_MS = MISMATCH_RESOLVE_DELAY_MS + 3500

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

type MobileTab = 'board' | 'moves' | 'chat'

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
  chatTermsAccepted,
  onAcceptChatTerms,
  chatUnreadCount = 0,
  someoneTyping = false,
  playerProfiles,
  onProfileClick,
  isGuest,
  isSpectator = false,
  allowSpectators = false,
  isRestarting = false,
  reconcileWithServerSnapshot,
}: MemoryGameBoardProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [optimisticFlippedIds, setOptimisticFlippedIds] = useState<string[]>([])
  const [mobileTab, setMobileTab] = useState<MobileTab>('board')
  const [overlayInspecting, setOverlayInspecting] = useState(false)
  // #1052: the three layout trees below are all mounted and two are hidden with
  // `display: none`, so the result overlay used to mount three times and the
  // after-game block inside it reported itself three times per finished game.
  // The overlay renders in the one tree the player can actually see.
  const activeGameLayout = useActiveGameLayout()
  const stuckTurnRecoveryRef = useRef(createStuckTurnRecovery())
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
  const gridRows =
    typeof gameData?.gridRows === 'number' && Number.isFinite(gameData.gridRows)
      ? gameData.gridRows
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

  // Keyed on the id list, so a matched pair pops once per arriving change, never per render.
  const matchedKey = matchedCardIds(cards).join(',')
  const prevMatchedRef = useRef<Set<string> | null>(null)
  const [justMatchedIds, setJustMatchedIds] = useState<string[]>([])
  const { playOwnFlip, forgetOwnFlip } = useMemorySounds({ gameId, cards, currentPlayerId, viewerId: currentUserId, isSpectator })
  useSpectatorResultCue({ isSpectator, isFinished, gameId, revealDelayMs: RESULT_REVEAL_DELAY_MS })

  const cardsLoaded = cards.length > 0
  useEffect(() => {
    if (!cardsLoaded) return
    const current = matchedKey ? matchedKey.split(',') : []
    const added = idsAddedSince(prevMatchedRef.current, current)
    prevMatchedRef.current = new Set(current)
    if (added.length === 0) return
    setJustMatchedIds(added)
    const timer = window.setTimeout(() => setJustMatchedIds([]), MATCH_CUE_MS)
    return () => window.clearTimeout(timer)
  }, [matchedKey, cardsLoaded])

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
      if (isSubmitting && move.type !== 'flip') return false

      setIsSubmitting(true)
      // This board posts its own moves rather than going through useGameActions,
      // so it has to report them itself – without this Memory, the game that
      // brings the most first-time players, had no move telemetry at all (#1063).
      const submitStartedAt = Date.now()
      const report = (success: boolean, statusCode?: number) =>
        trackMoveSubmitApplied({
          gameType: 'memory',
          moveType: move.type,
          durationMs: Date.now() - submitStartedAt,
          isGuest: !!isGuest,
          success,
          applied: success,
          statusCode,
          isAutoAction: !!options?.autoActionContext,
          source: 'memory_board',
        })
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
        report(res.ok, res.status)

        if (!res.ok) {
          const isExpectedRaceError =
            payload?.code === 'TURN_ALREADY_ENDED' ||
            payload?.code === 'TURN_TIMER_ACTIVE' ||
            payload?.code === 'AUTO_ACTION_DEBOUNCED' ||
            payload?.code === 'STATE_CONFLICT'

          if (!isExpectedRaceError) {
            playCue('ui.error')
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
        report(false)
        playCue('ui.error')
        showToast.errorFrom(error, 'games.memory.game.moveFailed')
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [gameId, isGuest, isSubmitting]
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
        // A pair resolving is a real pause, not a stuck turn — leave it alone.
        if (pendingMismatchCardIds.length === 2) return true
        // #989: the clock ran out on somebody else's turn and only they can end it.
        // If they have closed the tab nobody will, so ask the server — the lobby GET
        // sweeps an absent player and the leave path steps the turn off their seat
        // (#992). Throttled, and it gives up after a minute.
        const decision = stuckTurnRecoveryRef.current.decide(
          turnSignatureOf(timerState?.currentPlayerIndex, timerState?.lastMoveAt),
          Date.now()
        )
        if (decision === 'give-up') return true
        if (decision === 'resync') void reconcileWithServerSnapshot?.()
        return false
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

  // Watchdog: the resolve-mismatch broadcast above is fire-and-forget with no
  // delivery guarantee. If pendingMismatchCardIds is still stuck at 2 well
  // after the auto-resolve should have landed, the broadcast was likely
  // dropped — force a direct snapshot refetch instead of leaving the board
  // frozen until the player manually reloads the page.
  useEffect(() => {
    if (!isMyTurn || pendingMismatchCardIds.length !== 2 || !reconcileWithServerSnapshot) {
      return
    }

    const watchdogKey = `${currentPlayerId}:${pendingMismatchCardIds.join(':')}`

    const timer = window.setTimeout(() => {
      clientLogger.warn('Memory mismatch still pending after watchdog delay — reconciling from server', {
        watchdogKey,
      })
      void reconcileWithServerSnapshot()
    }, MISMATCH_RESOLVE_WATCHDOG_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentPlayerId, isMyTurn, pendingMismatchCardIds, reconcileWithServerSnapshot])

  const handleCardClick = useCallback(
    (cardId: string) => {
      if (!isMyTurn || pendingMismatchCardIds.length > 0 || optimisticFlippedIds.length >= 2) {
        return
      }

      setOptimisticFlippedIds((prev) => [...prev, cardId])
      playOwnFlip(cardId)

      void submitMove({ type: 'flip', data: { cardId } }).then((success) => {
        if (!success) {
          forgetOwnFlip(cardId)
          setOptimisticFlippedIds((prev) => prev.filter((id) => id !== cardId))
        }
      })
    },
    [isMyTurn, optimisticFlippedIds.length, pendingMismatchCardIds.length, submitMove, playOwnFlip, forgetOwnFlip]
  )

  if (!gameData || cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-bd-line bg-bd-bg2 px-8 py-10 text-center">
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
  const resultStandings = (parsedState.players ?? []).map((p) => ({
    id: p.id,
    name: displayNameByUserId.get(p.id) || p.name || 'Player',
    score: scoreByPlayerId[p.id] ?? 0,
    isViewer: p.id === currentUserId,
  }))
  const isMyWin = isFinished && !!winnerId && !!currentUserId && winnerId === currentUserId
  const viewerResult = viewerOutcome({ isFinished, isDraw, isSpectator, isSeated: !!currentUserId && (parsedState.players ?? []).some((p) => p.id === currentUserId), isViewerWinner: winnerId ? isMyWin : null, isViewerAtTop: hasTopScore(scoreByPlayerId, (parsedState.players ?? []).map((p) => p.id), currentUserId) })
  const symbolSizeClass = memorySymbolSizeClass(gridColumns)
  const matchedPairs = cards.filter((card) => card.isMatched).length / 2
  const totalPairs = Math.max(1, cards.length / 2)
  const currentPlayerName =
    (currentPlayerId && displayNameByUserId.get(currentPlayerId)) ||
    t('games.memory.game.unknownPlayer')

  const cardGrid = (
    <MemoryGrid gridColumns={gridColumns}>
      {cards.map((card, cardIndex) => {
        const isOptimisticallyFlipped = optimisticFlippedIds.includes(card.id)
        const isFaceUp = card.isFlipped || card.isMatched || isOptimisticallyFlipped
        const isDisabled =
          isSpectator ||
          !isMyTurn ||
          parsedState.status !== 'playing' ||
          pendingMismatchCardIds.length > 0 ||
          flippedCardIds.length >= 2 ||
          optimisticFlippedIds.length >= 2 ||
          card.isMatched ||
          card.isFlipped ||
          isOptimisticallyFlipped

        return (
          <MemoryCardTile
            key={card.id}
            card={card}
            cardIndex={cardIndex}
            isFaceUp={isFaceUp}
            symbolSizeClass={symbolSizeClass}
            isDisabled={isDisabled}
            onClick={() => handleCardClick(card.id)}
            isJustMatched={justMatchedIds.includes(card.id)}
            isMismatch={pendingMismatchCardIds.includes(card.id)}
          />
        )
      })}
    </MemoryGrid>
  )

  // One flag for both the class and the mount, so the desktop panel can never
  // paint without the overlay over it or - the #903 review's blocker - the
  // overlay hang over an unpainted panel. The mobile and landscape trees mount
  // their overlay on the whole board area rather than on this panel (#752), and
  // that area has never painted, on this branch or before it.
  const desktopShowsResultOverlay =
    activeGameLayout === 'desktop' && isFinished && !overlayInspecting && !isSpectator

  // Shared between the mobile board tab and the phone-landscape board pane
  // (#751) — desktop keeps its own inline markup since .memory-board-panel
  // carries extra --grid-cols/--grid-rows CSS custom properties this doesn't need.
  const renderBoardSection = (wrapClassName: string, layout: ActiveGameLayout) => (
    <>
      <div className={wrapClassName}>
        <div className="ttt-board-surface">
          {cardGrid}
          {/* Inside the surface, not beside it: this pill is
              `position: absolute; bottom`, so it hangs off the nearest
              positioned ancestor, and neither the panel nor the mobile board
              area paints (#903). The surface is the box the player can see. */}
          {activeGameLayout === layout && isFinished && overlayInspecting && (
            <button
              data-testid="show-results-pill"
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
      {activeGameLayout === layout && isFinished && !overlayInspecting && !isSpectator && (
        <GameResultOverlay
          title={isDraw ? t('games.memory.game.tieLabel') : isMyWin ? t('games.memory.game.youWin') : t('games.memory.game.winnerLabel', { player: winnerName })}
          isDraw={isDraw}
          accentColor="var(--bd-mint)"
          accentShadowColor="var(--bd-mint-deep)"
          standings={resultStandings}
          onInspect={() => setOverlayInspecting(true)}
          isHost={!!canStartGame}
          isLoading={isRestarting}
          onPlayAgain={onPlayAgain}
          onReturnToLobby={canStartGame ? onReturnToWaiting : undefined}
          onLeave={onLeave}
          isGuest={isGuest}
          inviteCode={lobbyCode}
          gameType="memory"
          outcome={viewerResult}
          resultKey={`${gameId}:${parsedState.lastMoveAt ?? ''}`}
          gameId={gameId}
          isRegistered={!isGuest && !isSpectator && !!currentUserId}
        />
      )}
    </>
  )

  const moveHistory: MemoryMoveRecord[] = Array.isArray(gameData?.moveHistory) ? (gameData.moveHistory as MemoryMoveRecord[]) : []

  const historyPanel = (
    <div className="memory-history-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
        <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('game.ui.moves')}</h3>
        <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
          {moveHistory.length}
        </span>
      </div>
      <div className="memory-history-list">
        {moveHistory.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', padding: '4px 2px' }}>{t('games.memory.game.noMovesYet')}</div>
          : moveHistory.slice().reverse().map((m, index) => (
            <div key={m.timestamp} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bd-card-warm)' }}>
              <span style={{ color: 'var(--bd-ink-muted)', width: 22, fontSize: 11, fontFamily: 'ui-monospace,monospace', flexShrink: 0 }}>
                #{String(moveHistory.length - index).padStart(2, '0')}
              </span>
              <span style={{ color: 'var(--bd-ink-soft)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {displayNameByUserId.get(m.playerId) || t('games.memory.game.unknownPlayer')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: m.isMatch ? 'var(--bd-mint-text)' : 'var(--bd-coral)' }}>
                {m.isMatch ? '✓' : '✗'}
              </span>
            </div>
          ))
        }
      </div>
    </div>
  )

  const isTwoPlayer = (parsedState.players?.length ?? 0) === 2
  const player0 = parsedState.players?.[0] ?? null
  const player1 = parsedState.players?.[1] ?? null

  const headerRoom: GameHeaderRoom = {
    gameId: 'memory',
    title: t('games.memory.name'),
    code: lobbyCode,
    isSpectator,
    allowSpectators,
    onLeave,
  }
  const headerSection = (
    <div className="memory-header" style={{
      background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(79,201,166,0.08) 100%)',
    }}>
      {isTwoPlayer && player0 && player1 ? (
        <GameScoreboardHeader
          room={headerRoom}
          leftCard={
            <GamePlayerCard
              name={displayNameByUserId.get(player0.id) || 'Player 1'}
              isActive={!isFinished && currentPlayerId === player0.id}
              isMe={player0.id === currentUserId}
              isWinner={isFinished && !!winnerId && winnerId === player0.id}
              side="left"
              avatarSrc={avatarByUserId.get(player0.id) ?? null}
              isPremium={premiumByUserId.get(player0.id)}
              userId={reportablePlayerId(players, player0.id)}
              lobbyCode={lobbyCode}
              accentColor="var(--bd-mint)"
              turnDotColor="var(--bd-mint-deep)"
              subline={<ScorePop value={scoreByPlayerId[player0.id] ?? 0} style={{ display: 'inline-block' }}>{t('games.memory.game.pairsLabel', { count: scoreByPlayerId[player0.id] ?? 0 })}</ScorePop>}
            />
          }
          center={
            <>
              <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                {difficultyLabel}
              </div>
              <ScorePop value={matchedPairs} style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                {matchedPairs}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>/</span>{totalPairs}
              </ScorePop>
              <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                {t('games.memory.game.scoreboardTitle')}
              </div>
            </>
          }
          centerCompact={
            <ScorePop value={matchedPairs} style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
              {matchedPairs}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 4px' }}>/</span>{totalPairs}
            </ScorePop>
          }
          rightCard={
            <GamePlayerCard
              name={displayNameByUserId.get(player1.id) || 'Player 2'}
              isActive={!isFinished && currentPlayerId === player1.id}
              isMe={player1.id === currentUserId}
              isWinner={isFinished && !!winnerId && winnerId === player1.id}
              side="right"
              avatarSrc={avatarByUserId.get(player1.id) ?? null}
              isPremium={premiumByUserId.get(player1.id)}
              userId={reportablePlayerId(players, player1.id)}
              lobbyCode={lobbyCode}
              accentColor="var(--bd-mint)"
              turnDotColor="var(--bd-mint-deep)"
              subline={<ScorePop value={scoreByPlayerId[player1.id] ?? 0} style={{ display: 'inline-block' }}>{t('games.memory.game.pairsLabel', { count: scoreByPlayerId[player1.id] ?? 0 })}</ScorePop>}
            />
          }
        />
      ) : (
        <GameScoreboardHeader
          room={headerRoom}
          players={(parsedState.players || []).map((player) => (
            <GamePlayerCard
              key={player.id}
              name={displayNameByUserId.get(player.id) || t('game.ui.playerFallback')}
              isActive={!isFinished && currentPlayerId === player.id}
              isMe={player.id === currentUserId}
              isWinner={isFinished && !!winnerId && winnerId === player.id}
              side="left"
              avatarSrc={avatarByUserId.get(player.id) ?? null}
              isPremium={premiumByUserId.get(player.id)}
              userId={reportablePlayerId(players, player.id)}
              lobbyCode={lobbyCode}
              accentColor="var(--bd-mint)"
              turnDotColor="var(--bd-mint-deep)"
              subline={<ScorePop value={scoreByPlayerId[player.id] ?? 0} style={{ display: 'inline-block' }}>{t('games.memory.game.pairsShort', { count: scoreByPlayerId[player.id] ?? 0 })}</ScorePop>}
            />
          ))}
        />
      )}
    </div>
  )

  const statusSection = (
    <GameStatusBanner
      isFinished={isFinished}
      isDraw={isDraw}
      outcome={viewerResult}
      finishedMessage={isDraw ? t('games.memory.game.tieLabel') : t('games.memory.game.winnerLabel', { player: winnerName })}
      activeTitle={t('games.memory.game.playerTurnBanner', { player: currentPlayerName })}
      meta={`${matchedPairs}/${totalPairs}`}
      secs={timeLeft}
      turnTimerLimit={turnTimerLimit}
      isYourTurn={!isSpectator && isMyTurn}
      barColor="var(--bd-mint)"
      isSpectator={isSpectator}
    />
  )

  // Shared between the mobile moves/chat tabs and the phone-landscape side
  // pane (#751) — dedupes the identical Play Again / Leave / waiting-for-host
  // footer that used to be copy-pasted in both tabs.
  const finishedActionsSection = isFinished && !isSpectator ? (
    <div style={{ flexShrink: 0, padding: '10px 16px', borderTop: '1px solid var(--bd-line)', display: 'flex', gap: 8 }}>
      {canStartGame && onPlayAgain && (
        <button onClick={onPlayAgain} className="bd-btn bd-btn-primary flex-1 justify-center">
          {t('lobby.game.playAgain')}
        </button>
      )}
      {onLeave && (
        <button onClick={onLeave} className="bd-btn bd-btn-soft flex-1 justify-center">
          {t('game.ui.leave')}
        </button>
      )}
      {!canStartGame && (
        <p style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--bd-ink-muted)', fontWeight: 600, margin: 0, alignSelf: 'center' }}>
          {t('game.ui.waitingForHost')}
        </p>
      )}
    </div>
  ) : null

  // Shared between the desktop side stack, the mobile chat tab, and the
  // phone-landscape side pane (#751).
  const chatSection = onSendChatMessage ? (
    <section className="game-chat-panel">
      <Chat
        lobbyCode={lobbyCode}
        messages={chatMessages}
        onSendMessage={onSendChatMessage}
        termsAccepted={chatTermsAccepted}
        onAcceptTerms={onAcceptChatTerms}
        currentUserId={currentUserId || null}
        isMinimized={false}
        onToggleMinimize={() => {}}
        unreadCount={chatUnreadCount}
        someoneTyping={someoneTyping}
        playerProfiles={playerProfiles}
        onProfileClick={onProfileClick}
        fullScreen
        readOnly={isSpectator}
      />
    </section>
  ) : null

  return (
    <div className="memory-screen">
      {/* ── Desktop layout ─────────────────────────────── */}
      <div className="memory-desktop-layout">
        <div className="memory-shell">
          {headerSection}
          {statusSection}

          <div className="memory-layout">
            <section className={`memory-board-panel${desktopShowsResultOverlay ? ' memory-board-panel--result' : ''}`} style={{ position: 'relative', '--grid-cols': gridColumns, '--grid-rows': gridRows } as React.CSSProperties}>
              <div className="ttt-board-surface">
                {cardGrid}
                {/* Inside the surface, not beside it - see renderBoardSection
                    above: the panel stopped painting in this state (#903), so
                    on the panel the pill was drawn on bare page. */}
                {activeGameLayout === 'desktop' && isFinished && overlayInspecting && (
                  <button
                    data-testid="show-results-pill"
                    onClick={() => setOverlayInspecting(false)}
                    style={{
                      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(31,27,22,0.75)', color: '#fff',
                      border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 20,
                      padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      zIndex: 5, backdropFilter: 'blur(4px)', whiteSpace: 'nowrap',
                    }}
                  >
                    {t('games.memory.game.showResults')}
                  </button>
                )}
              </div>
              {desktopShowsResultOverlay && (
                <GameResultOverlay
                  title={isDraw ? t('games.memory.game.tieLabel') : isMyWin ? t('games.memory.game.youWin') : t('games.memory.game.winnerLabel', { player: winnerName })}
                  isDraw={isDraw}
                  accentColor="var(--bd-mint)"
                  accentShadowColor="var(--bd-mint-deep)"
                  standings={resultStandings}
                  onInspect={() => setOverlayInspecting(true)}
                  isHost={!!canStartGame}
                  isLoading={isRestarting}
                  onPlayAgain={onPlayAgain}
                  onReturnToLobby={canStartGame ? onReturnToWaiting : undefined}
                  onLeave={onLeave}
                  isGuest={isGuest}
                  inviteCode={lobbyCode}
                  gameType="memory"
                  outcome={viewerResult}
                  resultKey={`${gameId}:${parsedState.lastMoveAt ?? ''}`}
                  gameId={gameId}
                  isRegistered={!isGuest && !isSpectator && !!currentUserId}
                />
              )}
            </section>

            <aside className="memory-side-stack">
              {historyPanel}
              {chatSection}
            </aside>
          </div>
        </div>
      </div>

      {/* ── Phone landscape (#751) ─────────────────────── */}
      <div className="game-landscape-layout">
        <div className="game-landscape-board memory-landscape-board">
          {renderBoardSection('memory-mobile-board-wrap', 'landscape')}
        </div>
        <div className="game-landscape-side">
          {headerSection}
          {statusSection}
          {chatSection}
          {finishedActionsSection}
        </div>
      </div>

      {/* ── Mobile layout ──────────────────────────────── */}
      <div className="memory-mobile-layout">
        <div className="memory-mobile-header">{headerSection}</div>

        {/* Status banner */}
        <div style={{ flexShrink: 0, padding: '4px 12px' }}>
          {statusSection}
        </div>

        {/* Tabs */}
        <GameTabs
          tabs={[
            { id: 'board' as const, label: t('games.memory.game.tabBoard') },
            { id: 'moves' as const, label: `${t('games.memory.game.tabMoves')} (${moveHistory.length})` },
            ...(onSendChatMessage ? [{ id: 'chat' as const, label: t('games.memory.game.tabChat'), badge: chatUnreadCount }] : []),
          ]}
          activeTab={mobileTab}
          onTabChange={setMobileTab}
        />

        {/* Tab content */}
        <div className="memory-mobile-content">
          {mobileTab === 'board' && (
            // The overlay mounts on this full board area (not inside the grid
            // wrap) so the result modal covers the whole tab, not just the
            // grid — on small grids the modal used to shrink with it (#752).
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 12px', position: 'relative' }}>
              {renderBoardSection('memory-mobile-board-wrap', 'mobile')}
            </div>
          )}

          {mobileTab === 'moves' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {historyPanel}
              </div>
              {finishedActionsSection}
            </div>
          )}

          {mobileTab === 'chat' && onSendChatMessage && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {chatSection}
              {finishedActionsSection}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
