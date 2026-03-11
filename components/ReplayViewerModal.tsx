'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { formatGameTypeLabel, getGameStatusBadgeColor } from '@/lib/game-display'
import Modal from './Modal'
import LoadingSpinner from './LoadingSpinner'

interface ReplayGamePlayer {
  userId: string
  username: string | null
  isBot: boolean
}

interface ReplaySnapshot {
  id: string
  turnNumber: number
  playerId: string | null
  actionType: string
  actionPayload: unknown
  state: unknown
  createdAt: string
}

interface ReplayData {
  game: {
    id: string
    lobbyCode?: string
    lobbyName: string
    gameType: string
    status?: string
    createdAt?: string
    updatedAt?: string
    players: ReplayGamePlayer[]
  }
  replay: {
    count: number
    snapshots: ReplaySnapshot[]
  }
}

interface ReplayViewerModalProps {
  gameId: string | null
  onClose: () => void
}

interface ReplayStanding {
  id: string
  name: string
  score: number | null
  isWinner: boolean
}

interface ReplayFact {
  label: string
  value: string
}

const REPLAY_SPEEDS = [0.5, 1, 2, 4]

const GAME_STATUS_KEYS = {
  waiting: 'profile.gameHistory.waiting',
  playing: 'profile.gameHistory.playing',
  finished: 'profile.gameHistory.finished',
  abandoned: 'profile.gameHistory.abandoned',
  cancelled: 'profile.gameHistory.cancelled',
} as const satisfies Record<string, TranslationKeys>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringValue(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getNumberValue(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getBooleanValue(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : null
}

function getRecordValue(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key]
  return isRecord(value) ? value : null
}

function getArrayValue(record: Record<string, unknown> | null, key: string): unknown[] {
  const value = record?.[key]
  return Array.isArray(value) ? value : []
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return String(value)
  }
}

function humanizeToken(value: string): string {
  const normalized = value.replace(/[:_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return value
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatGameStatusLabel(status: string, t: ReturnType<typeof useTranslation>['t']): string {
  const key = GAME_STATUS_KEYS[status as keyof typeof GAME_STATUS_KEYS]
  if (key) {
    return t(key)
  }
  return humanizeToken(status)
}

function getFriendlyReplayActionLabel(
  actionType: string,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (actionType === 'game:start') return t('profile.gameReplay.gameStarted')
  if (actionType === 'game:final-state') return t('profile.gameReplay.gameFinished')
  if (actionType === 'spy:init-round') return t('profile.gameReplay.roundStarted')
  if (actionType.endsWith('timeout-fallback')) return t('profile.gameReplay.timeoutResolved')
  if (actionType.startsWith('bot:')) return t('profile.gameReplay.botMove')

  switch (actionType) {
    case 'submit-choice':
      return t('profile.gameReplay.choiceLocked')
    case 'place':
      return t('profile.gameReplay.movePlayed')
    case 'roll':
      return t('profile.gameReplay.diceRolled')
    case 'hold':
      return t('profile.gameReplay.diceHeld')
    case 'score':
      return t('profile.gameReplay.scoreRecorded')
    case 'vote':
    case 'submit-vote':
      return t('profile.gameReplay.voteSubmitted')
    case 'submit-step':
      return t('profile.gameReplay.stepSubmitted')
    case 'submit-drawing':
      return t('profile.gameReplay.drawingSubmitted')
    case 'submit-guess':
      return t('profile.gameReplay.guessSubmitted')
    case 'submit-claim':
      return t('profile.gameReplay.claimSubmitted')
    case 'submit-challenge':
      return t('profile.gameReplay.challengeSubmitted')
    case 'advance-phase':
    case 'advance-round':
    case 'advance-reveal':
    case 'next-round':
      return t('profile.gameReplay.roundAdvanced')
    default:
      return humanizeToken(actionType)
  }
}

function getActionDetail(
  actionPayload: unknown,
  playerNameById: Map<string, string>
): string | null {
  const payload = isRecord(actionPayload) ? actionPayload : null

  const choice = getStringValue(payload, 'choice')
  if (choice) {
    return humanizeToken(choice)
  }

  const category = getStringValue(payload, 'category')
  if (category) {
    return humanizeToken(category)
  }

  const claim = getStringValue(payload, 'claim')
  if (claim) {
    return claim
  }

  const decision = getStringValue(payload, 'decision')
  if (decision) {
    return humanizeToken(decision)
  }

  const question = getStringValue(payload, 'question')
  if (question) {
    return question
  }

  const answer = getStringValue(payload, 'answer')
  if (answer) {
    return answer
  }

  const targetId = getStringValue(payload, 'targetId')
  if (targetId) {
    return playerNameById.get(targetId) || targetId
  }

  const row = getNumberValue(payload, 'row')
  const col = getNumberValue(payload, 'col')
  if (row !== null && col !== null) {
    return `Row ${row + 1}, Column ${col + 1}`
  }

  const submittedCount = getNumberValue(payload, 'autoSubmittedSteps')
  if (submittedCount !== null) {
    return `${submittedCount} auto-submitted step${submittedCount === 1 ? '' : 's'}`
  }

  return null
}

function resolveCurrentPlayerId(state: unknown): string | null {
  const stateRecord = isRecord(state) ? state : null
  const players = getArrayValue(stateRecord, 'players')
  const currentPlayerIndex = getNumberValue(stateRecord, 'currentPlayerIndex')
  if (currentPlayerIndex !== null && currentPlayerIndex >= 0 && currentPlayerIndex < players.length) {
    const playerRecord = isRecord(players[currentPlayerIndex]) ? players[currentPlayerIndex] : null
    const playerId = getStringValue(playerRecord, 'id')
    if (playerId) {
      return playerId
    }
  }

  const dataRecord = getRecordValue(stateRecord, 'data')
  return (
    getStringValue(dataRecord, 'currentPlayerId') ||
    getStringValue(dataRecord, 'currentTurnPlayerId') ||
    getStringValue(dataRecord, 'activePlayerId')
  )
}

function resolvePhaseLabel(state: unknown): string | null {
  const stateRecord = isRecord(state) ? state : null
  const dataRecord = getRecordValue(stateRecord, 'data')
  const phase =
    getStringValue(dataRecord, 'phase') ||
    getStringValue(dataRecord, 'stage') ||
    getStringValue(dataRecord, 'stepType')

  return phase ? humanizeToken(phase) : null
}

function resolveRoundValue(state: unknown): number | null {
  const stateRecord = isRecord(state) ? state : null
  const dataRecord = getRecordValue(stateRecord, 'data')

  return (
    getNumberValue(dataRecord, 'round') ||
    getNumberValue(dataRecord, 'roundNumber') ||
    getNumberValue(dataRecord, 'currentRound') ||
    getNumberValue(dataRecord, 'turn')
  )
}

function resolveWinnerLabel(
  state: unknown,
  playerNameById: Map<string, string>,
  t: ReturnType<typeof useTranslation>['t']
): string | null {
  const stateRecord = isRecord(state) ? state : null
  const dataRecord = getRecordValue(stateRecord, 'data')
  const winner =
    getStringValue(stateRecord, 'winner') ||
    getStringValue(dataRecord, 'winner') ||
    getStringValue(dataRecord, 'winnerId')

  if (!winner) {
    return null
  }

  if (winner === 'draw') {
    return t('profile.gameReplay.draw')
  }

  return playerNameById.get(winner) || winner
}

function resolveStandings(
  state: unknown,
  players: ReplayGamePlayer[],
  playerNameById: Map<string, string>
): ReplayStanding[] {
  const stateRecord = isRecord(state) ? state : null
  const statePlayers = getArrayValue(stateRecord, 'players')
  const winnerId = getStringValue(stateRecord, 'winner')

  if (statePlayers.length === 0) {
    return players.map((player) => ({
      id: player.userId,
      name: playerNameById.get(player.userId) || player.userId,
      score: null,
      isWinner: false,
    }))
  }

  const standings = statePlayers.flatMap((entry, index) => {
    const playerRecord = isRecord(entry) ? entry : null
    const playerId = getStringValue(playerRecord, 'id') || `player-${index}`
    const score = getNumberValue(playerRecord, 'score')
    const isWinner =
      getBooleanValue(playerRecord, 'isWinner') === true ||
      (winnerId !== null && winnerId === playerId)

    return [
      {
        id: playerId,
        name:
          playerNameById.get(playerId) ||
          getStringValue(playerRecord, 'username') ||
          getStringValue(playerRecord, 'name') ||
          playerId,
        score,
        isWinner,
      },
    ]
  })

  return standings.sort((left, right) => {
    const leftScore = left.score ?? Number.NEGATIVE_INFINITY
    const rightScore = right.score ?? Number.NEGATIVE_INFINITY
    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }

    if (left.isWinner !== right.isWinner) {
      return left.isWinner ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

function formatDateTime(dateValue: string | undefined): string | null {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

function getCurrentStepDescription(actorLabel: string | null, actionDetail: string | null): string | null {
  if (actorLabel && actionDetail) {
    return `${actorLabel} - ${actionDetail}`
  }

  if (actionDetail) {
    return actionDetail
  }

  return actorLabel
}

export default function ReplayViewerModal({ gameId, onClose }: ReplayViewerModalProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<ReplayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (!gameId) {
      setData(null)
      setLoading(false)
      setError(null)
      setIsPlaying(false)
      setCurrentIndex(0)
      return
    }

    const loadReplay = async () => {
      try {
        setLoading(true)
        setError(null)
        setIsPlaying(false)
        setCurrentIndex(0)
        setSpeed(1)

        const response = await fetch(`/api/game/${gameId}/replay`)
        if (!response.ok) {
          throw new Error(t('profile.gameReplay.loadFailed'))
        }

        const replayData: ReplayData = await response.json()
        setData(replayData)
      } catch (err) {
        clientLogger.error('Failed to load replay', err)
        setError(t('errors.failedToLoad'))
      } finally {
        setLoading(false)
      }
    }

    void loadReplay()
  }, [gameId, t])

  const snapshots = data?.replay.snapshots ?? []
  const currentSnapshot = snapshots[currentIndex] ?? null

  useEffect(() => {
    if (!isPlaying || snapshots.length <= 1) return

    const intervalMs = Math.max(250, Math.round(1200 / speed))
    const interval = setInterval(() => {
      setCurrentIndex((previousIndex) => {
        if (previousIndex >= snapshots.length - 1) {
          setIsPlaying(false)
          return previousIndex
        }
        return previousIndex + 1
      })
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isPlaying, snapshots.length, speed])

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const player of data?.game.players ?? []) {
      const fallback = player.isBot ? t('profile.gameReplay.bot') : t('profile.gameReplay.playerFallback')
      map.set(player.userId, player.username || fallback)
    }
    return map
  }, [data?.game.players, t])

  const actorLabel =
    currentSnapshot?.playerId ? playerNameById.get(currentSnapshot.playerId) || currentSnapshot.playerId : null

  const currentStatus = useMemo(() => {
    if (!currentSnapshot) return data?.game.status || null

    const snapshotState = isRecord(currentSnapshot.state) ? currentSnapshot.state : null
    return getStringValue(snapshotState, 'status') || data?.game.status || null
  }, [currentSnapshot, data?.game.status])

  const currentTurnLabel = useMemo(() => {
    if (!currentSnapshot) return null
    const currentPlayerId = resolveCurrentPlayerId(currentSnapshot.state)
    return currentPlayerId ? playerNameById.get(currentPlayerId) || currentPlayerId : null
  }, [currentSnapshot, playerNameById])

  const winnerLabel = useMemo(() => {
    if (!currentSnapshot) return null
    return resolveWinnerLabel(currentSnapshot.state, playerNameById, t)
  }, [currentSnapshot, playerNameById, t])

  const phaseLabel = useMemo(() => {
    if (!currentSnapshot) return null
    return resolvePhaseLabel(currentSnapshot.state)
  }, [currentSnapshot])

  const roundValue = useMemo(() => {
    if (!currentSnapshot) return null
    return resolveRoundValue(currentSnapshot.state)
  }, [currentSnapshot])

  const standings = useMemo(() => {
    if (!data || !currentSnapshot) return []
    return resolveStandings(currentSnapshot.state, data.game.players, playerNameById)
  }, [currentSnapshot, data, playerNameById])

  const currentStepTitle = useMemo(() => {
    if (!currentSnapshot) return t('profile.gameReplay.title')
    return getFriendlyReplayActionLabel(currentSnapshot.actionType, t)
  }, [currentSnapshot, t])

  const currentStepDescription = useMemo(() => {
    if (!currentSnapshot) return null
    return getCurrentStepDescription(
      actorLabel,
      getActionDetail(currentSnapshot.actionPayload, playerNameById)
    )
  }, [actorLabel, currentSnapshot, playerNameById])

  const currentFacts = useMemo<ReplayFact[]>(() => {
    if (!currentSnapshot) return []

    const facts: ReplayFact[] = []
    facts.push({
      label: t('profile.gameReplay.action'),
      value: getFriendlyReplayActionLabel(currentSnapshot.actionType, t),
    })

    facts.push({
      label: t('profile.gameReplay.player'),
      value: actorLabel || t('profile.gameReplay.system'),
    })

    if (currentStatus) {
      facts.push({
        label: t('profile.gameReplay.status'),
        value: formatGameStatusLabel(currentStatus, t),
      })
    }

    if (currentTurnLabel) {
      facts.push({
        label: t('profile.gameReplay.currentTurn'),
        value: currentTurnLabel,
      })
    }

    if (winnerLabel) {
      facts.push({
        label: t('profile.gameReplay.winner'),
        value: winnerLabel,
      })
    }

    if (phaseLabel) {
      facts.push({
        label: t('profile.gameReplay.phase'),
        value: phaseLabel,
      })
    }

    if (roundValue !== null) {
      facts.push({
        label: t('profile.gameReplay.round'),
        value: t('profile.gameReplay.roundValue', { value: roundValue }),
      })
    }

    return facts
  }, [
    actorLabel,
    currentSnapshot,
    currentStatus,
    currentTurnLabel,
    phaseLabel,
    roundValue,
    t,
    winnerLabel,
  ])

  function stepForward() {
    if (snapshots.length === 0) return
    setCurrentIndex((previousIndex) => Math.min(snapshots.length - 1, previousIndex + 1))
  }

  function stepBack() {
    if (snapshots.length === 0) return
    setCurrentIndex((previousIndex) => Math.max(0, previousIndex - 1))
  }

  function togglePlayPause() {
    if (snapshots.length <= 1) return
    if (currentIndex >= snapshots.length - 1) {
      setCurrentIndex(0)
    }
    setIsPlaying((previousValue) => !previousValue)
  }

  function onSeek(index: number) {
    if (Number.isNaN(index)) return
    const boundedIndex = Math.max(0, Math.min(snapshots.length - 1, index))
    setCurrentIndex(boundedIndex)
  }

  if (!gameId) return null

  return (
    <Modal
      isOpen={!!gameId}
      onClose={onClose}
      title={data?.game.lobbyName || t('profile.gameReplay.title')}
      maxWidth="2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      ) : !data || snapshots.length === 0 ? (
        <div className="py-10 text-center text-gray-600 dark:text-gray-300">
          {t('profile.gameReplay.noData')}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-700 dark:bg-slate-900/50 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {currentStatus && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getGameStatusBadgeColor(
                        currentStatus
                      )}`}
                    >
                      {formatGameStatusLabel(currentStatus, t)}
                    </span>
                  )}
                  {data.game.lobbyCode && (
                    <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                      {t('profile.gameReplay.lobbyCode')}: {data.game.lobbyCode}
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {t('profile.gameReplay.overview')}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
                    {formatGameTypeLabel(data.game.gameType)}
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  {data.game.players.map((player) => (
                    <span
                      key={player.userId}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {playerNameById.get(player.userId) || player.userId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[21rem]">
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('profile.gameReplay.players')}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {data.game.players.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('profile.gameReplay.totalSteps')}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {snapshots.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('profile.gameReplay.started')}
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatDateTime(data.game.createdAt) || '-'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('profile.gameReplay.updated')}
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatDateTime(data.game.updatedAt) || formatDateTime(currentSnapshot?.createdAt) || '-'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  disabled={snapshots.length <= 1}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                >
                  {isPlaying ? t('profile.gameReplay.pause') : t('profile.gameReplay.play')}
                </button>
                <button
                  type="button"
                  onClick={stepBack}
                  disabled={currentIndex === 0}
                  className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                >
                  {t('profile.gameReplay.stepBack')}
                </button>
                <button
                  type="button"
                  onClick={stepForward}
                  disabled={currentIndex >= snapshots.length - 1}
                  className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                >
                  {t('profile.gameReplay.stepForward')}
                </button>
                <label
                  htmlFor="replay-speed"
                  className="ml-auto text-sm font-medium text-slate-600 dark:text-slate-300"
                >
                  {t('profile.gameReplay.speed')}
                </label>
                <select
                  id="replay-speed"
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {REPLAY_SPEEDS.map((value) => (
                    <option key={value} value={value}>
                      {value}x
                    </option>
                  ))}
                </select>
                <a
                  href={`/api/game/${gameId}/replay?download=1`}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  {t('profile.gameReplay.download')}
                </a>
              </div>

              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, snapshots.length - 1)}
                  value={currentIndex}
                  onChange={(event) => onSeek(Number(event.target.value))}
                  className="w-full"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span>
                    {t('profile.gameReplay.stepOf', {
                      current: currentIndex + 1,
                      total: snapshots.length,
                    })}
                  </span>
                  <span>{formatDateTime(currentSnapshot?.createdAt) || '-'}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
              <div className="mb-4">
                <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {t('profile.gameReplay.timeline')}
                </h4>
              </div>
              <div className="max-h-[26rem] space-y-2 overflow-auto pr-1">
                {snapshots.map((snapshot, index) => {
                  const snapshotActor =
                    snapshot.playerId ? playerNameById.get(snapshot.playerId) || snapshot.playerId : null
                  const isActive = index === currentIndex

                  return (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => onSeek(index)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/70 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-blue-500 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            {t('profile.gameReplay.stepLabel', { value: index + 1 })}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {getFriendlyReplayActionLabel(snapshot.actionType, t)}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(snapshot.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="mt-2 truncate text-xs text-slate-600 dark:text-slate-300">
                        {getCurrentStepDescription(
                          snapshotActor,
                          getActionDetail(snapshot.actionPayload, playerNameById)
                        ) || t('profile.gameReplay.system')}
                      </div>
                    </button>
                  )
                })}
              </div>
            </aside>

            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      {t('profile.gameReplay.currentStep')}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
                      {currentStepTitle}
                    </h3>
                  </div>
                  <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                    {t('profile.gameReplay.stepLabel', { value: currentIndex + 1 })}
                  </span>
                </div>

                {currentStepDescription && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    {currentStepDescription}
                  </p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {currentFacts.map((fact) => (
                    <div
                      key={`${fact.label}-${fact.value}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50"
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {fact.label}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {standings.some((entry) => entry.score !== null) && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      {t('profile.gameReplay.scoreboard')}
                    </h4>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {standings.map((entry, index) => (
                      <div
                        key={entry.id}
                        className={`rounded-xl border p-3 ${
                          entry.isWinner
                            ? 'border-amber-300 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/30'
                            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                              {t('profile.gameReplay.rankValue', { value: index + 1 })}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {entry.name}
                            </div>
                          </div>
                          {entry.isWinner && (
                            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                              {t('profile.gameReplay.winner')}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
                          {entry.score ?? '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('profile.gameReplay.advancedDetails')}
                </summary>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {t('profile.gameReplay.actionPayload')}
                    </h4>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                      {currentSnapshot ? toPrettyJson(currentSnapshot.actionPayload) : 'null'}
                    </pre>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {t('profile.gameReplay.state')}
                    </h4>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                      {currentSnapshot ? toPrettyJson(currentSnapshot.state) : 'null'}
                    </pre>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
