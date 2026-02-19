'use client'

import React from 'react'
import { SpyGamePhase } from '@/lib/games/spy-game'
import SpyRoleReveal from '@/components/SpyRoleReveal'
import SpyVoting from '@/components/SpyVoting'
import SpyResults from '@/components/SpyResults'
import { GamePlayer } from '@/types/game'
import { getAuthHeaders } from '@/lib/socket-url'
import { showToast } from '@/lib/i18n-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import { GameState } from '@/lib/game-engine'

interface SpyRoleInfo {
  role: string
  location?: string
  locationRole?: string
  possibleCategories?: string[]
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
  onBackToLobby?: () => void
}

function computeVoteLeader(votes: Record<string, string>): string {
  const counts: Record<string, number> = {}
  for (const targetId of Object.values(votes)) {
    counts[targetId] = (counts[targetId] || 0) + 1
  }

  let leaderId = ''
  let maxVotes = -1
  for (const [playerId, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count
      leaderId = playerId
    }
  }

  return leaderId
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
      })),
    [players]
  )

  const playersById = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; score: number }>()
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
      try {
        const res = await fetch(`/api/game/${gameId}/spy-action`, {
          method: 'POST',
          headers: getAuthHeaders(isGuest, guestId, guestName, guestToken),
          body: JSON.stringify({
            action,
            data: actionData,
          }),
        })
        const payload = await res.json()

        if (!res.ok) {
          throw new Error(payload.error || 'Failed to submit action')
        }

        await refreshAfterAction()
      } catch (error) {
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
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-4 text-white sm:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Guess the Spy</h2>
              <p className="text-sm text-indigo-100">
                Lobby {lobbyCode.toUpperCase()} · {t('spy.round', { current: data.currentRound || 1, total: data.totalRounds || 3 })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                {phase.replace('_', ' ')}
              </span>
              <button
                type="button"
                onClick={() => void refreshAfterAction()}
                className="rounded-lg bg-white/20 px-3 py-1 text-sm font-medium hover:bg-white/30"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {phase === SpyGamePhase.WAITING && (
          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center">
            <h3 className="text-2xl font-bold">{t('spy.phases.waiting')}</h3>
            <p className="mt-2 text-indigo-100">
              {isCreator
                ? 'Initializing first round...'
                : 'Waiting for lobby creator to initialize the round.'}
            </p>
            {isCreator && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => void initializeRound()}
                className="mt-4 rounded-xl bg-indigo-500 px-4 py-2 font-semibold hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Initialize Round
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
          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center">
            <p className="text-indigo-100">{isRoleLoading ? 'Loading role information...' : 'Role information is not available yet.'}</p>
          </div>
        )}

        {phase === SpyGamePhase.QUESTIONING && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-5">
              <h3 className="text-lg font-semibold">{t('spy.phases.questioning')}</h3>
              <p className="mt-1 text-sm text-indigo-100">
                {t('spy.timeRemaining', { time: `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')}` })}
              </p>

              {isMyQuestionTurn && !data.currentTargetId && (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium">Target player</label>
                  <select
                    value={questionTargetId}
                    onChange={(event) => setQuestionTargetId(event.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 text-sm"
                  >
                    {availableTargets.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>

                  <label className="block text-sm font-medium">Question</label>
                  <textarea
                    value={questionText}
                    onChange={(event) => setQuestionText(event.target.value)}
                    placeholder={t('spy.askQuestion')}
                    className="min-h-24 w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 text-sm"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!questionTargetId || !questionText.trim() || isActionLoading}
                      onClick={() => {
                        const question = questionText.trim()
                        if (!question || !questionTargetId) return
                        setQuestionText('')
                        void submitAction('ask-question', { targetId: questionTargetId, question })
                      }}
                      className="flex-1 rounded-lg bg-indigo-500 px-4 py-2 font-semibold hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Ask
                    </button>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => void submitAction('skip-turn')}
                      className="flex-1 rounded-lg bg-slate-600 px-4 py-2 font-semibold hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('spy.skipTurn')}
                    </button>
                  </div>
                </div>
              )}

              {shouldAnswerNow && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg bg-slate-900/60 p-3 text-sm text-indigo-100">
                    <strong>Question:</strong> {data.pendingQuestion}
                  </div>
                  <textarea
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    placeholder={t('spy.answerQuestion')}
                    className="min-h-24 w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 text-sm"
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
                    className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Submit Answer
                  </button>
                </div>
              )}

              {!isMyQuestionTurn && !shouldAnswerNow && (
                <div className="mt-4 rounded-lg bg-slate-900/60 p-3 text-sm text-indigo-100">
                  {currentQuestioner
                    ? `${currentQuestioner.name} is deciding on a question.`
                    : 'Waiting for the current questioner...'}
                  {currentTarget ? ` Target: ${currentTarget.name}.` : ''}
                </div>
              )}

              {isMyQuestionTurn && data.currentTargetId && (
                <div className="mt-4 rounded-lg bg-slate-900/60 p-3 text-sm text-indigo-100">
                  Waiting for {currentTarget?.name || 'player'} to answer.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/10 p-5">
              <h3 className="text-lg font-semibold">Conversation</h3>
              <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                {questionHistory.length === 0 && (
                  <p className="text-sm text-indigo-100">No questions asked yet.</p>
                )}
                {questionHistory.map((entry) => (
                  <div key={`${entry.timestamp}-${entry.askerId}`} className="rounded-lg bg-slate-900/60 p-3 text-sm">
                    <p className="font-semibold text-indigo-200">
                      {entry.askerName} → {entry.targetName}
                    </p>
                    <p className="mt-1 text-indigo-100">Q: {entry.question}</p>
                    <p className="mt-1 text-indigo-100">A: {entry.answer}</p>
                  </div>
                ))}
              </div>
            </div>
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
            scores={scores}
            currentRound={data.currentRound || 1}
            totalRounds={data.totalRounds || 3}
            onNextRound={
              isCreator && (data.currentRound || 1) < (data.totalRounds || 3)
                ? () => void initializeRound()
                : undefined
            }
            onPlayAgain={onPlayAgain}
            onRequestRematch={onRequestRematch}
            onBackToLobby={onBackToLobby}
          />
        )}
      </div>
    </div>
  )
}
