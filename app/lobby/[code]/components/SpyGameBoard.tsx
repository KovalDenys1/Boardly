'use client'

import React from 'react'
import { SpyGamePhase } from '@/lib/games/spy-game'
import SpyRoleReveal from '@/components/SpyRoleReveal'
import SpyVoting from '@/components/SpyVoting'
import SpyResults from '@/components/SpyResults'
import { GamePlayer } from '@/types/game'
import { getAuthHeaders } from '@/lib/auth-headers'
import { showToast } from '@/lib/i18n-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import { GameState } from '@/lib/game-engine'
import { trackMoveSubmitApplied } from '@/lib/analytics'

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
  const formattedTime = `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')}`
  const phaseLimit =
    phase === SpyGamePhase.QUESTIONING
      ? Number(data.questionTimeLimit || 0)
      : phase === SpyGamePhase.VOTING
        ? Number(data.votingTimeLimit || 0)
        : 0
  const timerProgress = phaseLimit > 0 ? Math.max(0, Math.min(100, (timeRemaining / phaseLimit) * 100)) : 0

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
        const res = await fetch(`/api/game/${gameId}/spy-action`, {
          method: 'POST',
          headers: getAuthHeaders(isGuest, guestId, guestName, guestToken),
          body: JSON.stringify({
            action,
            data: actionData,
          }),
        })
        responseStatus = res.status
        const payload = await res.json()

        if (!res.ok) {
          throw new Error(payload.error || 'Failed to submit action')
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
    if (!currentUserId) return
    if (phase === SpyGamePhase.WAITING) return

    void fetchRoleInfo()
  }, [currentUserId, fetchRoleInfo, phase, state.updatedAt])

  React.useEffect(() => {
    if (!isCreator || phase !== SpyGamePhase.WAITING) return

    const key = `${gameId}:${String(state.updatedAt || '')}`
    if (autoInitKeyRef.current === key) return
    autoInitKeyRef.current = key

    void initializeRound({ silent: true })
  }, [gameId, initializeRound, isCreator, phase, state.updatedAt])

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

  return (
    <div className="spy-screen">
      <div className="spy-shell">
        <header className="spy-header">
          <div className="min-w-0">
            <p className="bd-kicker">{t('spy.round', { current: data.currentRound || 1, total: data.totalRounds || 3 })}</p>
            <h2 className="mt-1 truncate text-2xl font-black text-[var(--bd-ink)]">{t('spy.gameTitle')}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--bd-ink-muted)]">Lobby {lobbyCode.toUpperCase()}</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bd-chip bd-chip-lav">{phaseLabel}</span>
              <button
                type="button"
                onClick={() => void refreshAfterAction()}
                className="bd-btn bd-btn-soft px-3 py-2 text-sm"
              >
                {t('spy.refresh')}
              </button>
            </div>
            {(phase === SpyGamePhase.QUESTIONING || phase === SpyGamePhase.VOTING) && (
              <div className="spy-header-timer">
                <span>{t('spy.timeRemaining', { time: formattedTime })}</span>
                <span className="spy-header-timer-track">
                  <span style={{ width: `${timerProgress}%` }} />
                </span>
              </div>
            )}
          </div>
        </header>

        <div className="spy-phase-rail" aria-hidden="true">
          {[
            SpyGamePhase.ROLE_REVEAL,
            SpyGamePhase.QUESTIONING,
            SpyGamePhase.VOTING,
            SpyGamePhase.RESULTS,
          ].map((entry) => (
            <span
              key={entry}
              className={`spy-phase-dot ${phase === entry ? 'spy-phase-dot-active' : ''}`}
            />
          ))}
        </div>

        {phase === SpyGamePhase.WAITING && (
          <div className="spy-panel p-6 text-center">
            <p className="bd-kicker">{t('spy.phases.waiting')}</p>
            <h3 className="mt-2 text-2xl font-black text-[var(--bd-ink)]">{t('spy.gameTitle')}</h3>
            <p className="mt-2 text-sm font-semibold text-[var(--bd-ink-muted)]">
              {isCreator
                ? t('spy.initializingRound')
                : t('spy.waitingForCreator')}
            </p>
            {isCreator && (
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

        {phase === SpyGamePhase.ROLE_REVEAL && roleInfo && (
          <SpyRoleReveal
            role={roleInfo.role}
            location={roleInfo.location}
            locationRole={roleInfo.locationRole}
            possibleCategories={roleInfo.possibleCategories}
            onReady={() => void submitAction('player-ready')}
            playersReady={playersReady.length}
            totalPlayers={normalizedPlayers.length}
            isReady={!!currentUserId && playersReady.includes(currentUserId)}
          />
        )}

        {phase === SpyGamePhase.ROLE_REVEAL && !roleInfo && (
          <div className="spy-panel p-6 text-center">
            <p className="text-sm font-semibold text-[var(--bd-ink-muted)]">{isRoleLoading ? t('spy.loadingRole') : t('spy.roleUnavailable')}</p>
          </div>
        )}

        {phase === SpyGamePhase.QUESTIONING && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <section className="spy-panel p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="bd-kicker">{t('spy.phases.questioning')}</p>
                    <h3 className="mt-1 text-xl font-black text-[var(--bd-ink)]">
                      {currentQuestioner
                        ? t('spy.currentTurn', { player: currentQuestioner.name })
                        : t('spy.waitingForQuestioner')}
                    </h3>
                  </div>
                  <span className="spy-timer-pill">{t('spy.timeRemaining', { time: formattedTime })}</span>
                </div>

                {isMyQuestionTurn && !data.currentTargetId && (
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

                {shouldAnswerNow && (
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

                {!isMyQuestionTurn && !shouldAnswerNow && (
                  <div className="mt-5 rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] p-4 text-sm font-semibold text-[var(--bd-ink-muted)]">
                    {currentQuestioner
                      ? t('spy.decidingQuestion', { player: currentQuestioner.name })
                      : t('spy.waitingForQuestioner')}
                    {currentTarget ? ` ${t('spy.targetLabel', { player: currentTarget.name })}` : ''}
                  </div>
                )}

                {isMyQuestionTurn && data.currentTargetId && (
                  <div className="mt-5 rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] p-4 text-sm font-semibold text-[var(--bd-ink-muted)]">
                    {t('spy.waitingForAnswer', { player: currentTarget?.name || t('spy.targetPlayer') })}
                  </div>
                )}


                {isCreator && (
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
                  {questionHistory.map((entry) => (
                    <div key={`${entry.timestamp}-${entry.askerId}`} className="rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg)] p-3 text-sm">
                      <p className="font-black text-[var(--bd-ink)]">
                        {entry.askerName} - {entry.targetName}
                      </p>
                      <p className="mt-2 text-[var(--bd-ink-soft)]"><strong>{t('spy.questionPrefix')}</strong> {entry.question}</p>
                      <p className="mt-1 text-[var(--bd-ink-soft)]"><strong>{t('spy.answerPrefix')}</strong> {entry.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              {roleInfo && (
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
              )}

              <section className="spy-panel p-4">
                <h3 className="spy-section-title">{t('spy.scores')}</h3>
                <div className="mt-3 space-y-2">
                  {normalizedPlayers.map((player) => {
                    const isCurrent = player.id === data.currentQuestionerId
                    return (
                      <div key={player.id} className={`spy-player-row ${isCurrent ? 'spy-player-row-active' : ''}`}>
                        {player.avatarSrc ? (
                          <img src={player.avatarSrc} alt={player.name} className="h-8 w-8 shrink-0 rounded-xl border-2 border-bd-ink object-cover" />
                        ) : (
                          <span className="bd-avatar bd-avatar-sky h-8 w-8">{player.name.charAt(0).toUpperCase()}</span>
                        )}
                        <span className={`flex min-w-0 flex-1 items-center gap-1 truncate font-bold ${player.isPremium ? 'text-amber-500' : ''}`}>
                          {player.name}
                          {player.isPremium && <span className="shrink-0 text-xs" title="Premium">👑</span>}
                        </span>
                        <span className="font-black">{scores[player.id] || 0}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </aside>
          </div>
        )}

        {phase === SpyGamePhase.VOTING && currentUserId && (
          <SpyVoting
            players={normalizedPlayers}
            currentUserId={currentUserId}
            onVote={(targetId) => void submitAction('vote', { targetId })}
            hasVoted={hasVoted}
            votesSubmitted={votesSubmitted}
            timeRemaining={timeRemaining}
          />
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
              isCreator && (data.currentRound || 1) < (data.totalRounds || 3)
                ? () => void initializeRound()
                : undefined
            }
            onPlayAgain={onPlayAgain}
            isHost={isCreator}
            onRequestRematch={onRequestRematch}
            isRequestRematchPending={isRequestingRematch}
            onBackToLobby={onBackToLobby}
          />
        )}
      </div>
    </div>
  )
}
