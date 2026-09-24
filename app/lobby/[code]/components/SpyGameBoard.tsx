'use client'

import React from 'react'
import { SpyGamePhase } from '@/lib/games/spy-game'
import SpyRoleReveal from '@/components/SpyRoleReveal'
import SpyVoting from '@/components/SpyVoting'
import SpyResults from '@/components/SpyResults'
import { resolveSpyGameResult } from '@/lib/games/spy-outcome'
import Chat from '@/components/Chat'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameLeaveButton from '@/components/game-chrome/GameLeaveButton'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'
import { GamePlayer, ChatMessagePayload } from '@/types/game'
import { getAuthHeaders } from '@/lib/auth-headers'
import { showToast } from '@/lib/i18n-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { GameState } from '@/lib/game-engine'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import ScorePop from '@/components/game-chrome/ScorePop'
import { useFreshKey } from '@/hooks/useFreshKey'
import { latestEntryKey, onOwnAnimationEnd } from '@/lib/social-motion'

interface SpyRoleInfo {
  role: string
  location?: string
  locationRole?: string
  possibleCategories?: string[]
  possibleLocations?: string[]
}

interface SpyQuestionHistoryEntry {
  askerId: string
  askerName: string
  targetId: string
  targetName: string
  question: string
  answer: string
  timestamp: number
}

interface SpyGameData {
  phase?: SpyGamePhase
  currentRound?: number
  totalRounds?: number
  location?: string
  spyPlayerId?: string
  votes?: Record<string, string>
  scores?: Record<string, number>
  playersReady?: string[]
  phaseStartTime?: number
  questionTimeLimit?: number
  votingTimeLimit?: number
  currentQuestionerId?: string | null
  currentTargetId?: string | null
  pendingQuestion?: string | null
  questionHistory?: SpyQuestionHistoryEntry[]
  allLocationNames?: string[]
  spyGuessedLocation?: string
}

interface SpyGameBoardProps {
  gameId: string
  lobbyCode: string
  lobbyCreatorId?: string | null
  players: GamePlayer[]
  state: GameState<unknown>
  currentUserId: string | null | undefined
  isGuest: boolean
  guestId: string | null
  guestName: string | null
  guestToken: string | null
  onRefresh: () => Promise<void> | void
  onPlayAgain?: () => void
  onRequestRematch?: () => void
  isRequestingRematch?: boolean
  onBackToLobby?: () => void
  /**
   * Host-only: put the lobby back in its waiting room (#905 review). #905 keeps
   * the board mounted after a Spy game finishes so the table can read its end
   * screen, which also means the automatic drop back to the waiting room no
   * longer happens - and without this the lobby's settings, invite, add-bot and
   * kick controls were unreachable for the rest of that lobby's life. Memory
   * and Yahtzee take the same callback from the same handler.
   */
  onReturnToWaiting?: () => void
  /** Disables Play Again / Return to Waiting while either is in flight. */
  isRestarting?: boolean
  onLeave?: () => void
  registerUrl?: string
  isSpectator?: boolean
  /**
   * Lobby chat, handed down by whoever owns `useLobbyChat` (LobbyPageClient,
   * or the spectate page). Guess the Spy is a conversation game – the talking
   * is the content – so the chat is the right column on desktop and a tab on
   * mobile, exactly where every other kit game puts it. Omit `onSendChatMessage`
   * and no chat panel or tab is rendered.
   */
  chatMessages?: ChatMessagePayload[]
  onSendChatMessage?: (message: string) => void
  chatUnreadCount?: number
  onResetChatUnread?: () => void
  someoneTyping?: boolean
  playerProfiles?: Map<string, { avatarUrl?: string | null; isPremium?: boolean }>
  onProfileClick?: (userId: string) => void
}

function computeVoteLeader(votes: Record<string, string>): string {
  const counts: Record<string, number> = {}
  for (const targetId of Object.values(votes)) {
    counts[targetId] = (counts[targetId] || 0) + 1
  }

  let maxVotes = -1
  const leaders: string[] = []
  for (const [playerId, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count
      leaders.length = 0
      leaders.push(playerId)
    } else if (count === maxVotes) {
      leaders.push(playerId)
    }
  }

  // Tie on max votes means no one is voted out (spy escapes).
  return leaders.length === 1 ? leaders[0] : ''
}

export default function SpyGameBoard({
  gameId,
  lobbyCode,
  lobbyCreatorId,
  players,
  state,
  currentUserId,
  isGuest,
  guestId,
  guestName,
  guestToken,
  onRefresh,
  onPlayAgain,
  onRequestRematch,
  isRequestingRematch = false,
  onBackToLobby,
  onReturnToWaiting,
  isRestarting = false,
  onLeave,
  registerUrl = '/auth/register',
  isSpectator = false,
  chatMessages = [],
  onSendChatMessage,
  chatUnreadCount = 0,
  onResetChatUnread,
  someoneTyping = false,
  playerProfiles,
  onProfileClick,
}: SpyGameBoardProps) {
  const { t } = useTranslation()
  const showActionError = React.useCallback((message: string) => {
    showToast.error('errors.general', message, { message })
  }, [])

  const [roleInfo, setRoleInfo] = React.useState<SpyRoleInfo | null>(null)
  const [isActionLoading, setIsActionLoading] = React.useState(false)
  const [questionTargetId, setQuestionTargetId] = React.useState('')
  const [questionText, setQuestionText] = React.useState('')
  const [answerText, setAnswerText] = React.useState('')
  const [timeRemaining, setTimeRemaining] = React.useState(0)
  const [isRoleLoading, setIsRoleLoading] = React.useState(false)
  const [guessLocation, setGuessLocation] = React.useState('')
  const [showGuessConfirm, setShowGuessConfirm] = React.useState(false)
  const [mobileTab, setMobileTab] = React.useState<'board' | 'players' | 'chat'>('board')
  const [overlayInspecting, setOverlayInspecting] = React.useState(false)
  const autoInitKeyRef = React.useRef<string | null>(null)

  const data = (state.data || {}) as SpyGameData
  const phase = data.phase || SpyGamePhase.WAITING
  const isCreator = !!currentUserId && lobbyCreatorId === currentUserId

  const normalizedPlayers = React.useMemo(
    () =>
      players.map((player) => ({
        id: player.userId,
        name: player.user?.username || player.name || 'Player',
        score: player.score || 0,
        avatarSrc: player.user?.avatarUrl ?? player.user?.image ?? null,
        isPremium: !!(player.user as { isPremium?: boolean } | undefined)?.isPremium,
      })),
    [players]
  )

  const playersById = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; score: number; avatarSrc: string | null }>()
    for (const player of normalizedPlayers) {
      map.set(player.id, player)
    }
    return map
  }, [normalizedPlayers])

  const votes = data.votes || {}
  const scores = data.scores || {}
  const playersReady = data.playersReady || []
  const questionHistory = data.questionHistory || []
  const hasVoted = !!currentUserId && !!votes[currentUserId]
  const votesSubmitted = Object.keys(votes).length
  const eliminatedId = computeVoteLeader(votes)
  const spyId = data.spyPlayerId || ''

  const currentQuestioner =
    data.currentQuestionerId ? playersById.get(data.currentQuestionerId) : null
  const currentTarget =
    data.currentTargetId ? playersById.get(data.currentTargetId) : null
  const phaseLabel =
    phase === SpyGamePhase.WAITING
      ? t('spy.phases.waiting')
      : phase === SpyGamePhase.ROLE_REVEAL
        ? t('spy.phases.roleReveal')
        : phase === SpyGamePhase.QUESTIONING
          ? t('spy.phases.questioning')
          : phase === SpyGamePhase.VOTING
            ? t('spy.phases.voting')
            : t('spy.phases.results')
  const phaseLimit =
    phase === SpyGamePhase.QUESTIONING
      ? Number(data.questionTimeLimit || 0)
      : phase === SpyGamePhase.VOTING
        ? Number(data.votingTimeLimit || 0)
        : 0

  const isMyQuestionTurn =
    !!currentUserId && data.currentQuestionerId === currentUserId
  const shouldAnswerNow =
    !!currentUserId &&
    data.currentTargetId === currentUserId &&
    typeof data.pendingQuestion === 'string' &&
    data.pendingQuestion.length > 0

  const availableTargets = React.useMemo(
    () => normalizedPlayers.filter((player) => player.id !== currentUserId),
    [normalizedPlayers, currentUserId]
  )

  // Motion (#1115). Each is "did this just happen while I was watching": the
  // state a page loads into is never fresh, so a reload does not replay it.
  const round = data.currentRound || 1
  const { fresh: roleFlipFresh, settle: settleRoleFlip } = useFreshKey(
    phase === SpyGamePhase.ROLE_REVEAL ? `reveal-${round}` : null,
  )
  const { fresh: resultsFresh, settle: settleResults } = useFreshKey(
    phase === SpyGamePhase.RESULTS ? `results-${round}` : null,
  )
  const { fresh: latestEntryFresh, settle: settleLatestEntry } = useFreshKey(
    latestEntryKey(questionHistory, (entry) => `${entry.timestamp}-${entry.askerId}`),
  )

  const fetchRoleInfo = React.useCallback(async () => {
    if (!currentUserId || phase === SpyGamePhase.WAITING) return

    setIsRoleLoading(true)
    try {
      const res = await fetch(`/api/game/${gameId}/spy-role`, {
        method: 'GET',
        headers: getAuthHeaders(isGuest, guestId, guestName, guestToken),
      })
      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to fetch role info')
      }

      setRoleInfo(payload.roleInfo || null)
    } catch (error) {
      showActionError(String((error as Error)?.message || 'Failed to fetch role info'))
    } finally {
      setIsRoleLoading(false)
    }
  }, [currentUserId, gameId, guestId, guestName, guestToken, isGuest, phase, showActionError])

  const refreshAfterAction = React.useCallback(async () => {
    await Promise.resolve(onRefresh())
  }, [onRefresh])

  const initializeRound = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!isCreator) return

      setIsActionLoading(true)
      try {
        const res = await fetch(`/api/game/${gameId}/spy-init`, {
          method: 'POST',
          headers: getAuthHeaders(isGuest, guestId, guestName, guestToken),
        })
        const payload = await res.json()

        if (!res.ok) {
          throw new Error(payload.error || 'Failed to initialize round')
        }

        if (!options?.silent) {
          showToast.success('spy.roundInitialized')
        }

        await refreshAfterAction()
      } catch (error) {
        if (!options?.silent) {
          showActionError(String((error as Error)?.message || 'Failed to initialize round'))
        }
      } finally {
        setIsActionLoading(false)
      }
    },
    [gameId, guestId, guestName, guestToken, isCreator, isGuest, refreshAfterAction, showActionError]
  )

  const submitAction = React.useCallback(
    async (action: string, actionData: Record<string, unknown> = {}) => {
      setIsActionLoading(true)
      const submitStartedAt = Date.now()
      let responseStatus: number | undefined
      let moveMetricTracked = false

      try {
        const sendAction = () => fetch(`/api/game/${gameId}/spy-action`, {
          method: 'POST',
          headers: getAuthHeaders(isGuest, guestId, guestName, guestToken),
          body: JSON.stringify({
            action,
            data: actionData,
          }),
        })

        let res = await sendAction()
        responseStatus = res.status
        let payload = await res.json().catch(() => null)

        // Ready-ups and votes are submitted by the whole table at once, and the
        // server writes under an optimistic lock on the game row, so the one who
        // loses the race is told nothing was written. Sending again is the
        // recovery: the route re-reads state on every request (#993).
        for (let attempt = 1; attempt < 3 && res.status === 409 && payload?.code === 'STATE_CONFLICT'; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
          res = await sendAction()
          responseStatus = res.status
          payload = await res.json().catch(() => null)
        }

        if (!res.ok) {
          throw new Error(payload?.error || 'Failed to submit action')
        }

        await refreshAfterAction()

        trackMoveSubmitApplied({
          gameType: 'guess_the_spy',
          moveType: action,
          durationMs: Date.now() - submitStartedAt,
          isGuest,
          success: true,
          applied: true,
          statusCode: responseStatus,
        })
        moveMetricTracked = true
      } catch (error) {
        if (!moveMetricTracked) {
          trackMoveSubmitApplied({
            gameType: 'guess_the_spy',
            moveType: action,
            durationMs: Date.now() - submitStartedAt,
            isGuest,
            success: false,
            applied: false,
            statusCode: responseStatus,
          })
        }
        showActionError(String((error as Error)?.message || 'Failed to submit action'))
      } finally {
        setIsActionLoading(false)
      }
    },
    [gameId, guestId, guestName, guestToken, isGuest, refreshAfterAction, showActionError]
  )

  React.useEffect(() => {
    if (phase !== SpyGamePhase.QUESTIONING) return
    if (questionTargetId) return
    if (!availableTargets.length) return

    setQuestionTargetId(availableTargets[0].id)
  }, [availableTargets, phase, questionTargetId])

  React.useEffect(() => {
    if (guessLocation) return
    const locations = roleInfo?.possibleLocations
    if (locations && locations.length > 0) {
      setGuessLocation(locations[0])
    }
  }, [guessLocation, roleInfo])

  React.useEffect(() => {
    if (isSpectator) return
    if (!currentUserId) return
    if (phase === SpyGamePhase.WAITING) return

    void fetchRoleInfo()
  }, [currentUserId, fetchRoleInfo, isSpectator, phase, state.updatedAt])

  React.useEffect(() => {
    if (isSpectator) return
    if (!isCreator || phase !== SpyGamePhase.WAITING) return

    const key = `${gameId}:${String(state.updatedAt || '')}`
    if (autoInitKeyRef.current === key) return
    autoInitKeyRef.current = key

    void initializeRound({ silent: true })
  }, [gameId, initializeRound, isCreator, isSpectator, phase, state.updatedAt])

  React.useEffect(() => {
    const resolveRemaining = () => {
      const phaseStart = Number(data.phaseStartTime || 0)
      if (!phaseStart) return 0

      let limit = 0
      if (phase === SpyGamePhase.QUESTIONING) {
        limit = Number(data.questionTimeLimit || 0)
      } else if (phase === SpyGamePhase.VOTING) {
        limit = Number(data.votingTimeLimit || 0)
      } else {
        return 0
      }

      const elapsed = Math.floor((Date.now() - phaseStart) / 1000)
      return Math.max(0, limit - elapsed)
    }

    setTimeRemaining(resolveRemaining())
    const intervalId = window.setInterval(() => {
      setTimeRemaining(resolveRemaining())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [data.phaseStartTime, data.questionTimeLimit, data.votingTimeLimit, phase])

  // ─── Shared chrome (#905) ────────────────────────────────────────────────
  // Everything below composes components/game-chrome rather than the
  // hand-rolled `.spy-header`, so Leave, the status line, the mobile tabs and
  // the result sit where they sit in every other game.

  const currentRound = data.currentRound || 1
  const totalRounds = data.totalRounds || 3
  const isResults = phase === SpyGamePhase.RESULTS
  const isGameOver = isResults && currentRound >= totalRounds
  // The ROUND verdict belongs to SpyResults, which owns the reveal and already
  // computes it from resolveSpyOutcome. The end of the GAME is the engine's: it ranks the
  // cumulative scores across every round and writes the top total to
  // state.winner. Titling the overlay from the round instead announced the
  // last round's winner as the game's - contradicting the score table printed
  // underneath it - and gave the trophy to a player who had not won (#905
  // review, reproduced against the real engine: scores Alice 890 / Bob 690 /
  // Carol 140, engine winner Alice, overlay title 'spy.spyWins', Bob holding
  // the trophy).
  const gameResult = resolveSpyGameResult({
    winnerId: typeof state.winner === 'string' ? state.winner : null,
    currentUserId,
  })
  const gameWinnerName = playersById.get(gameResult.winnerId)?.name ?? ''
  const finishedMessage = gameResult.isDraw
    ? t('spy.gameTie')
    : gameResult.isMine
      ? t('spy.youWinGame')
      : t('spy.gameWinner', { player: gameWinnerName })
  const iWon = gameResult.isMine

  /**
   * Who the table is waiting on, which is what the left seat of the scoreboard
   * says in every phase. A two-seat header on a ten-seat game only earns its
   * place if the left card is never a placeholder: during questioning that is
   * the questioner, before it the first player who has not readied, during the
   * vote the first who has not voted, and at the results the spy.
   */
  const waitingOnId = (() => {
    if (phase === SpyGamePhase.ROLE_REVEAL) {
      return normalizedPlayers.find((player) => !playersReady.includes(player.id))?.id ?? ''
    }
    if (phase === SpyGamePhase.QUESTIONING) return data.currentQuestionerId || ''
    if (phase === SpyGamePhase.VOTING) {
      return normalizedPlayers.find((player) => !votes[player.id])?.id ?? ''
    }
    if (phase === SpyGamePhase.RESULTS) return spyId
    return ''
  })()

  /**
   * The right seat is the viewer, except when the viewer is already the left
   * seat – the table waiting on you must not be printed as two identical cards
   * (layout DoD: no duplicated signals). Then it shows the other half of the
   * exchange: whoever was asked, or the next seat at the table.
   */
  const rightSeatId = (() => {
    if (!currentUserId || waitingOnId !== currentUserId) return currentUserId ?? ''
    if (data.currentTargetId && data.currentTargetId !== currentUserId) return data.currentTargetId
    return normalizedPlayers.find((player) => player.id !== currentUserId)?.id ?? ''
  })()

  const seatCard = (
    seat: { id: string; name: string; avatarSrc: string | null; isPremium?: boolean } | undefined,
    side: 'left' | 'right',
    isActive: boolean
  ) => (
    <GamePlayerCard
      name={seat?.name ?? '–'}
      isActive={isActive}
      isMe={!!seat && seat.id === currentUserId}
      isWinner={false}
      side={side}
      avatarSrc={seat?.avatarSrc ?? null}
      isPremium={!!seat?.isPremium}
      accentColor={side === 'left' ? 'var(--bd-lav)' : 'var(--bd-coral)'}
      turnDotColor="var(--bd-lav-deep)"
      subline={seat ? `${scores[seat.id] || 0}` : undefined}
    />
  )

  const headerSection = (
    <div className="ttt-card spy-header-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(155,140,255,0.12) 100%)', overflow: 'hidden', padding: '12px 16px' }}>
      <div style={{ position: 'absolute', right: -10, top: -14, opacity: 0.12, transform: 'rotate(12deg)', pointerEvents: 'none', lineHeight: 1 }}>
        <Icon name="eye" size={96} />
      </div>
      <GameScoreboardHeader
        leftCard={seatCard(
          waitingOnId ? playersById.get(waitingOnId) : undefined,
          'left',
          !isResults && !!waitingOnId
        )}
        center={
          <>
            <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
              {t('game.ui.round')}
            </div>
            <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
              {currentRound}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>/</span>{totalRounds}
            </div>
            <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
              {phaseLabel}
            </div>
          </>
        }
        centerCompact={
          <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
            {currentRound}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>/</span>{totalRounds}
          </div>
        }
        rightCard={seatCard(
          rightSeatId ? playersById.get(rightSeatId) : undefined,
          'right',
          !isResults && !!rightSeatId && rightSeatId === data.currentTargetId
        )}
        trailing={
          isSpectator
            ? <GameLeaveButton label={t('game.ui.backToLobby')} href={`/lobby/${lobbyCode}`} variant="back" />
            : onLeave
              ? <GameLeaveButton label={t('game.ui.leave')} onClick={onLeave} />
              : undefined
        }
      />
    </div>
  )

  const activeTitle = (() => {
    if (phase === SpyGamePhase.WAITING) {
      return isCreator && !isSpectator ? t('spy.initializingRound') : t('spy.waitingForCreator')
    }
    if (phase === SpyGamePhase.ROLE_REVEAL) {
      return t('spy.playersReady', { count: playersReady.length, total: normalizedPlayers.length })
    }
    if (phase === SpyGamePhase.QUESTIONING) {
      return currentQuestioner ? t('spy.currentTurn', { player: currentQuestioner.name }) : t('spy.waitingForQuestioner')
    }
    if (phase === SpyGamePhase.VOTING) return t('spy.voteFor')
    return t('spy.phases.results')
  })()

  // Role reveal already counts readiness in its own line, so a meta counter
  // beside it would print "0/3 players ready 0/3".
  const statusMeta =
    phase === SpyGamePhase.VOTING ? `${votesSubmitted}/${normalizedPlayers.length}` : undefined

  const statusSection = (
    <GameStatusBanner
      isFinished={isGameOver}
      finishedMessage={finishedMessage}
      activeTitle={activeTitle}
      meta={statusMeta}
      // Only the questioning and voting phases run a clock; the others have no
      // deadline at all, and a shared banner with no timer to show hides it
      // rather than printing a stopped :00.
      showTimer={phaseLimit > 0}
      secs={timeRemaining}
      turnTimerLimit={phaseLimit}
      isYourTurn={!isSpectator && (isMyQuestionTurn || shouldAnswerNow || (phase === SpyGamePhase.VOTING && !hasVoted))}
      barColor="var(--bd-lav)"
      leadingIcon={<Icon name="eye" size={20} />}
      isSpectator={isSpectator}
    />
  )

  // Not during the reveal: SpyRoleReveal is showing the same card on the board,
  // full size, and the point of that phase is that one card.
  const showRoleCard =
    !!roleInfo && !isSpectator && (phase === SpyGamePhase.QUESTIONING || phase === SpyGamePhase.VOTING)
  const roleCard = showRoleCard && roleInfo ? (
    <section className="spy-panel p-4">
      <p className="bd-kicker">{t('spy.yourRole')}</p>
      <h3 className={`mt-1 text-2xl font-black ${roleInfo.role === 'Spy' ? 'text-[var(--bd-coral-deep)]' : 'text-[var(--bd-mint-deep)]'}`}>
        {t(roleInfo.role === 'Spy' ? 'spy.roles.spy' : 'spy.roles.regular')}
      </h3>
      {roleInfo.role === 'Spy' ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roleInfo.possibleCategories?.map((category) => (
              <span key={category} className="bd-chip bd-chip-coral py-1 text-[11px]">{category}</span>
            ))}
          </div>
          {roleInfo.possibleLocations && roleInfo.possibleLocations.length > 0 && (
            <div className="mt-4 border-t border-[var(--bd-line)] pt-4">
              {!showGuessConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowGuessConfirm(true)}
                  className="bd-btn bd-btn-coral w-full justify-center text-sm"
                >
                  {t('spy.guessLocation')}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--bd-ink-muted)]">
                    {t('spy.guessLocationWarning')}
                  </p>
                  <div className="relative">
                    <select
                      value={guessLocation}
                      onChange={(e) => setGuessLocation(e.target.value)}
                      className="bd-input w-full appearance-none pr-10 cursor-pointer text-sm"
                    >
                      {roleInfo.possibleLocations.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <svg className="h-4 w-4 text-bd-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!guessLocation || isActionLoading}
                      onClick={() => void submitAction('spy-guess-location', { location: guessLocation })}
                      className="bd-btn bd-btn-coral flex-1 justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('spy.guessLocationConfirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGuessConfirm(false)}
                      className="bd-btn bd-btn-soft px-3 text-sm"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-2 text-sm font-semibold text-[var(--bd-ink-soft)]">
          <p><span className="text-[var(--bd-ink-muted)]">{t('spy.location')}:</span> {roleInfo.location}</p>
          <p><span className="text-[var(--bd-ink-muted)]">{t('spy.roleAtLocation')}:</span> {roleInfo.locationRole}</p>
        </div>
      )}
    </section>
  ) : null

  // The roster: the right column's first row on desktop, the Players tab on a
  // phone. Ten seats do not fit in a scoreboard header (the same reason Sketch
  // & Guess keeps its standings here), so this is where the table lives.
  const rosterSection = (
    <div className="spy-side-stack">
      {roleCard}
      <section className="spy-panel spy-roster-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="spy-section-title">{t('spy.scores')}</h3>
          {/* The old header carried a manual Refresh and the shared chrome has
              no slot for one. It stays rather than being dropped in a refactor:
              a phase that never advanced because a broadcast was missed is the
              one thing a player here cannot work around. */}
          <button
            type="button"
            onClick={() => void refreshAfterAction()}
            className="bd-btn bd-btn-soft px-2.5 py-1.5 text-xs"
          >
            {t('spy.refresh')}
          </button>
        </div>
        <div className="spy-roster-list mt-3">
          {normalizedPlayers.map((player) => {
            const isCurrent = player.id === data.currentQuestionerId
            return (
              // The active class carries a one-off nudge, so the row the turn
              // just moved to moves once (#1115).
              <div key={player.id} className={`spy-player-row ${isCurrent ? 'spy-player-row-active social-turn-nudge' : ''}`}>
                {player.avatarSrc ? (
                  <img src={player.avatarSrc} alt={player.name} className="h-8 w-8 shrink-0 rounded-xl border-2 border-bd-ink object-cover" />
                ) : (
                  <span className="bd-avatar bd-avatar-sky h-8 w-8">{player.name.charAt(0).toUpperCase()}</span>
                )}
                <span className={`flex min-w-0 flex-1 items-center gap-1 truncate font-bold ${player.isPremium ? 'text-amber-500' : ''}`}>
                  {player.name}
                  {player.isPremium && <Icon name="crown" size={13} tone="premium" label="Premium" className="shrink-0" />}
                </span>
                <ScorePop value={scores[player.id] || 0} className="font-black" style={{ display: 'inline-block' }}>{scores[player.id] || 0}</ScorePop>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )

  const chatSection = onSendChatMessage ? (
    <section className="game-chat-panel">
      <Chat
        messages={chatMessages}
        onSendMessage={onSendChatMessage}
        currentUserId={currentUserId || null}
        playerProfiles={playerProfiles}
        isMinimized={false}
        onToggleMinimize={() => {}}
        unreadCount={chatUnreadCount}
        someoneTyping={someoneTyping}
        onProfileClick={onProfileClick}
        fullScreen
        readOnly={isSpectator}
      />
    </section>
  ) : null

  const phaseContent = (
    <>
        {phase === SpyGamePhase.WAITING && (
          <div className="spy-panel bd-screen p-6 text-center">
            <p className="bd-kicker">{t('spy.phases.waiting')}</p>
            <h3 className="mt-2 text-2xl font-black text-[var(--bd-ink)]">{t('spy.gameTitle')}</h3>
            <p className="mt-2 text-sm font-semibold text-[var(--bd-ink-muted)]">
              {isSpectator
                ? t('spy.waitingForCreator')
                : isCreator
                  ? t('spy.initializingRound')
                  : t('spy.waitingForCreator')}
            </p>
            {isCreator && !isSpectator && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => void initializeRound()}
                className="bd-btn bd-btn-primary mx-auto mt-4 justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('spy.initializeRound')}
              </button>
            )}
          </div>
        )}

        {phase === SpyGamePhase.ROLE_REVEAL && !isSpectator && roleInfo && (
          <SpyRoleReveal
            role={roleInfo.role}
            location={roleInfo.location}
            locationRole={roleInfo.locationRole}
            possibleCategories={roleInfo.possibleCategories}
            onReady={() => void submitAction('player-ready')}
            playersReady={playersReady.length}
            totalPlayers={normalizedPlayers.length}
            isReady={!!currentUserId && playersReady.includes(currentUserId)}
            flip={roleFlipFresh}
            onFlipEnd={settleRoleFlip}
          />
        )}

        {phase === SpyGamePhase.ROLE_REVEAL && (isSpectator || !roleInfo) && (
          <div className="spy-panel p-6 text-center">
            <p className="text-sm font-semibold text-[var(--bd-ink-muted)]">
              {isSpectator
                ? `${playersReady.length}/${normalizedPlayers.length} ${t('spy.phases.roleReveal').toLowerCase()}`
                : isRoleLoading ? t('spy.loadingRole') : t('spy.roleUnavailable')}
            </p>
          </div>
        )}

        {phase === SpyGamePhase.QUESTIONING && (
          <div className="bd-screen space-y-4">
              <section className="spy-panel p-5">
                {/* No title row and no timer pill: GameStatusBanner directly
                    above already says whose turn it is and how long is left,
                    and the layout DoD asks for one place per signal (#905). */}

                {isMyQuestionTurn && !data.currentTargetId && !isSpectator && (
                  <div className="mt-5 space-y-3">
                    <label className="block text-sm font-bold text-[var(--bd-ink)]">{t('spy.targetPlayer')}</label>
                    <div className="relative">
                      <select
                        value={questionTargetId}
                        onChange={(event) => setQuestionTargetId(event.target.value)}
                        className="bd-input w-full appearance-none pr-10 cursor-pointer"
                      >
                        {availableTargets.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        <svg className="h-4 w-4 text-bd-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    <label className="block text-sm font-bold text-[var(--bd-ink)]">{t('spy.questionLabel')}</label>
                    <textarea
                      value={questionText}
                      onChange={(event) => setQuestionText(event.target.value)}
                      placeholder={t('spy.askQuestion')}
                      className="bd-input min-h-28 resize-none"
                    />

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={!questionTargetId || !questionText.trim() || isActionLoading}
                        onClick={() => {
                          const question = questionText.trim()
                          if (!question || !questionTargetId) return
                          setQuestionText('')
                          void submitAction('ask-question', { targetId: questionTargetId, question })
                        }}
                        className="bd-btn bd-btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('spy.askButton')}
                      </button>
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => void submitAction('skip-turn')}
                        className="bd-btn bd-btn-soft flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('spy.skipTurn')}
                      </button>
                    </div>
                  </div>
                )}

                {shouldAnswerNow && !isSpectator && (
                  <div className="mt-5 space-y-3">
                    <div className="rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] p-4 text-sm font-semibold text-[var(--bd-ink-soft)]">
                      <strong className="text-[var(--bd-ink)]">{t('spy.questionPrompt')}</strong> {data.pendingQuestion}
                    </div>
                    <textarea
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      placeholder={t('spy.answerQuestion')}
                      className="bd-input min-h-28 resize-none"
                    />
                    <button
                      type="button"
                      disabled={!answerText.trim() || isActionLoading}
                      onClick={() => {
                        const answer = answerText.trim()
                        if (!answer) return
                        setAnswerText('')
                        void submitAction('answer-question', { answer })
                      }}
                      className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('spy.submitAnswer')}
                    </button>
                  </div>
                )}

                {(!isMyQuestionTurn || isSpectator) && !shouldAnswerNow && (
                  // Keyed on the questioner, so the turn passing slides the line in again.
                  <div key={data.currentQuestionerId || 'none'} className="game-status-cue mt-5 rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] p-4 text-sm font-semibold text-[var(--bd-ink-muted)]">
                    {currentQuestioner
                      ? t('spy.decidingQuestion', { player: currentQuestioner.name })
                      : t('spy.waitingForQuestioner')}
                    {currentTarget ? ` ${t('spy.targetLabel', { player: currentTarget.name })}` : ''}
                  </div>
                )}

                {isMyQuestionTurn && data.currentTargetId && !isSpectator && (
                  <div className="mt-5 rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] p-4 text-sm font-semibold text-[var(--bd-ink-muted)]">
                    {t('spy.waitingForAnswer', { player: currentTarget?.name || t('spy.targetPlayer') })}
                  </div>
                )}


                {isCreator && !isSpectator && (
                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => void submitAction('start-voting')}
                      className="bd-btn bd-btn-coral w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('spy.startVoting')}
                    </button>
                  </div>
                )}
              </section>

              <section className="spy-panel p-5">
                <h3 className="spy-section-title">{t('spy.conversation')}</h3>
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {questionHistory.length === 0 && (
                    <p className="rounded-xl bg-[var(--bd-card-warm)] p-4 text-sm font-semibold text-[var(--bd-ink-muted)]">{t('spy.noQuestionsYet')}</p>
                  )}
                  {questionHistory.map((entry, index) => {
                    const isNewest = index === questionHistory.length - 1 && latestEntryFresh
                    return (
                    <div
                      key={`${entry.timestamp}-${entry.askerId}`}
                      className={`rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-3 text-sm ${isNewest ? 'social-entry-in' : ''}`}
                      onAnimationEnd={isNewest ? onOwnAnimationEnd(settleLatestEntry) : undefined}
                    >
                      <p className="font-black text-[var(--bd-ink)]">
                        {entry.askerName} - {entry.targetName}
                      </p>
                      <p className="mt-2 text-[var(--bd-ink-soft)]"><strong>{t('spy.questionPrefix')}</strong> {entry.question}</p>
                      <p className="mt-1 text-[var(--bd-ink-soft)]"><strong>{t('spy.answerPrefix')}</strong> {entry.answer}</p>
                    </div>
                    )
                  })}
                </div>
              </section>
          </div>
        )}

        {phase === SpyGamePhase.VOTING && currentUserId && !isSpectator && (
          <SpyVoting
            players={normalizedPlayers}
            currentUserId={currentUserId}
            onVote={(targetId) => void submitAction('vote', { targetId })}
            hasVoted={hasVoted}
            votesSubmitted={votesSubmitted}
            timeRemaining={timeRemaining}
          />
        )}

        {phase === SpyGamePhase.VOTING && isSpectator && (
          <div className="spy-panel bd-screen p-5 text-center">
            <p className="bd-kicker">{t('spy.phases.voting')}</p>
            <ScorePop value={votesSubmitted} className="mt-2 text-sm font-semibold text-[var(--bd-ink-muted)]">
              {votesSubmitted}/{normalizedPlayers.length} {t('spy.phases.voting').toLowerCase()}
            </ScorePop>
          </div>
        )}

        {phase === SpyGamePhase.RESULTS && (
          <SpyResults
            players={normalizedPlayers}
            votes={votes}
            eliminatedId={eliminatedId}
            spyId={spyId}
            location={data.location || 'Unknown'}
            spyGuessedLocation={data.spyGuessedLocation}
            scores={scores}
            currentRound={data.currentRound || 1}
            totalRounds={data.totalRounds || 3}
            onNextRound={
              !isSpectator && isCreator && (data.currentRound || 1) < (data.totalRounds || 3)
                ? () => void initializeRound()
                : undefined
            }
            onPlayAgain={isSpectator ? undefined : onPlayAgain}
            isHost={!isSpectator && isCreator}
            onRequestRematch={isSpectator ? undefined : onRequestRematch}
            isRequestRematchPending={isRequestingRematch}
            onBackToLobby={isSpectator ? undefined : onBackToLobby}
            gameWinnerId={gameResult.winnerId || null}
            onReturnToWaiting={!isSpectator && isCreator ? onReturnToWaiting : undefined}
            isReturningToWaiting={isRestarting}
            isGuest={isSpectator ? false : isGuest}
            registerUrl={registerUrl}
            lobbyCode={lobbyCode}
            isRegistered={!isSpectator && !isGuest && !!currentUserId}
            reveal={resultsFresh}
            onRevealEnd={settleResults}
          />
        )}
    </>
  )

  // The board card is the mount point for GameResultOverlay, so it is the
  // positioned ancestor (`position: relative` in .spy-board-card).
  const renderBoardSection = (testId?: string) => (
    <div className="spy-board-card" data-testid={testId}>
      {phaseContent}
      {isGameOver && !isSpectator && !overlayInspecting && (
        <GameResultOverlay
          title={finishedMessage}
          kicker={t('lobby.game.gameOver')}
          isDraw={gameResult.isDraw}
          accentColor="var(--bd-lav)"
          accentShadowColor="var(--bd-lav-deep)"
          // A draw takes the kit's own handshake; a decided game gets the
          // trophy for the winner and the eye for everyone else.
          icon={
            gameResult.isDraw ? undefined : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: iWon ? 'var(--bd-mint-deep)' : 'var(--bd-coral)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 3px rgba(255,255,255,0.15)' }}>
                <Icon name={iWon ? 'trophy' : 'eye'} size={28} tone="on-accent" />
              </div>
            )
          }
          onInspect={() => setOverlayInspecting(true)}
          isHost={isCreator}
          isLoading={isRequestingRematch || isActionLoading || isRestarting}
          onPlayAgain={onPlayAgain}
          onReturnToLobby={onReturnToWaiting}
          onLeave={onLeave}
          isGuest={isGuest}
          registerUrl={registerUrl}
          inviteCode={lobbyCode}
          gameType="guess_the_spy"
          resultKey={`${gameId}:${state.lastMoveAt ?? ''}`}
          isRegistered={!isGuest && !!currentUserId}
        />
      )}
      {isGameOver && !isSpectator && overlayInspecting && (
        <button
          onClick={() => setOverlayInspecting(false)}
          style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(31,27,22,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}
        >
          {t('games.tictactoe.game.showResults')}
        </button>
      )}
    </div>
  )

  return (
    <div className="game-screen ttt-screen spy-screen-kit">

      {/* ── DESKTOP ─────────────────────────────────────────────────── */}
      <div className="ttt-desktop-layout">
        <div className="ttt-grid">
          {headerSection}
          <div className="ttt-center-col">
            {statusSection}
            {renderBoardSection('spy-board')}
          </div>
          <div className="ttt-right-col">
            {rosterSection}
            {chatSection}
          </div>
        </div>
      </div>

      {/* ── PHONE LANDSCAPE ─────────────────────────────────────────── */}
      <div className="game-landscape-layout">
        <div className="game-landscape-board">
          {renderBoardSection('spy-board-landscape')}
        </div>
        <div className="game-landscape-side">
          {headerSection}
          {statusSection}
          {chatSection ?? rosterSection}
        </div>
      </div>

      {/* ── MOBILE ──────────────────────────────────────────────────── */}
      <div className="ttt-mobile-layout">
        {headerSection}
        {statusSection}
        <GameTabs
          tabs={[
            { id: 'board' as const, label: t('game.ui.tabBoard') },
            { id: 'players' as const, label: t('game.ui.tabPlayers') },
            ...(chatSection ? [{ id: 'chat' as const, label: t('game.ui.tabChat'), badge: chatUnreadCount }] : []),
          ]}
          activeTab={mobileTab}
          onTabChange={(id) => {
            setMobileTab(id)
            if (id === 'chat') onResetChatUnread?.()
          }}
        />
        <div className="ttt-mobile-content">
          {mobileTab === 'board' && renderBoardSection('spy-board-mobile')}
          {mobileTab === 'players' && rosterSection}
          {mobileTab === 'chat' && chatSection}
        </div>
      </div>
    </div>
  )
}
