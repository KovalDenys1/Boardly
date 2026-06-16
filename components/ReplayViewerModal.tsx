'use client'

import { useEffect, useMemo, useState, type ComponentType, Suspense } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { hasReplayRenderer, loadReplayRenderer } from './replay/registry'
import type { ReplayRendererProps } from './replay/types'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import {
  formatCompactDuration,
  formatGameTypeLabel,
  getGameStatusBadgeColor,
} from '@/lib/game-display'
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
    endedAt?: string | null
    durationMs?: number | null
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
    return `${actorLabel} • ${actionDetail}`
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
  const [GameRenderer, setGameRenderer] = useState<ComponentType<ReplayRendererProps> | null>(null)

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
        if (hasReplayRenderer(replayData.game.gameType)) {
          const renderer = await loadReplayRenderer(replayData.game.gameType)
          setGameRenderer(() => renderer)
        }
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
  const finalSnapshot = snapshots[snapshots.length - 1] ?? null

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

  const finalWinnerLabel = useMemo(() => {
    if (!finalSnapshot) return null
    return resolveWinnerLabel(finalSnapshot.state, playerNameById, t)
  }, [finalSnapshot, playerNameById, t])

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

  const finalStatus = data?.game.status || currentStatus || null
  const replaySummary = useMemo(() => {
    if (finalWinnerLabel) {
      return t('profile.gameReplay.summaryWinner', { player: finalWinnerLabel })
    }

    if (finalStatus === 'finished') {
      return t('profile.gameReplay.summaryFinished')
    }

    if (finalStatus === 'abandoned') {
      return t('profile.gameReplay.summaryAbandoned')
    }

    if (finalStatus === 'cancelled') {
      return t('profile.gameReplay.summaryCancelled')
    }

    return t('profile.gameReplay.summaryInProgress')
  }, [finalStatus, finalWinnerLabel, t])

  const replayOverviewFacts = useMemo<ReplayFact[]>(() => {
    if (!data) return []

    const locale = typeof navigator === 'undefined' ? 'en' : navigator.language

    return [
      {
        label: t('profile.gameReplay.players'),
        value: String(data.game.players.length),
      },
      {
        label: t('profile.gameReplay.totalSteps'),
        value: String(snapshots.length),
      },
      {
        label: t('profile.gameReplay.started'),
        value: formatDateTime(data.game.createdAt) || '-',
      },
      {
        label: t('profile.gameReplay.duration'),
        value: formatCompactDuration(data.game.durationMs, locale),
      },
      {
        label: t('profile.gameReplay.endedOn'),
        value: formatDateTime(data.game.endedAt || data.game.updatedAt) || '-',
      },
      {
        label: t('profile.gameReplay.winner'),
        value:
          finalWinnerLabel ||
          (finalStatus === 'finished'
            ? t('profile.gameReplay.draw')
            : t('profile.gameResults.noWinner')),
      },
    ]
  }, [data, finalStatus, finalWinnerLabel, snapshots.length, t])

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
      maxWidth="4xl"
      mobileFullscreen
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 sm:py-16">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 sm:p-5">
          {error}
        </div>
      ) : !data || snapshots.length === 0 ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/70">
          <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5 dark:border-slate-700/50 dark:from-slate-900/70 dark:to-slate-800/70">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/70 bg-white text-3xl shadow-sm dark:border-slate-700/60 dark:bg-slate-800">
              🎞️
            </div>
            <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('profile.gameReplay.unavailable')}
            </h3>
            <p className="mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-400">
              {data?.game.status === 'abandoned'
                ? t('profile.gameResults.replayUnavailableAbandoned')
                : data?.game.status === 'cancelled'
                  ? t('profile.gameResults.replayUnavailableCancelled')
                  : data?.game.status === 'playing' || data?.game.status === 'waiting'
                    ? t('profile.gameResults.replayUnavailableInProgress')
                    : t('profile.gameResults.replayUnavailableFinished')}
            </p>
            {data?.game.status && (
              <div className="mt-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  data.game.status === 'finished' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' :
                  data.game.status === 'abandoned' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' :
                  data.game.status === 'cancelled' ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                }`}>
                  {data.game.status}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">

          {/* ── Hero strip ── */}
          <div className="overflow-hidden rounded-2xl" style={{ border: '1.5px solid var(--bd-line)' }}>
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
              style={{ background: 'var(--bd-bg2)' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                {finalStatus && (
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getGameStatusBadgeColor(finalStatus)}`}>
                    {formatGameStatusLabel(finalStatus, t)}
                  </span>
                )}
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-soft)' }}
                >
                  {formatGameTypeLabel(data.game.gameType)}
                </span>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>
                {replaySummary}
              </p>
            </div>
            <dl
              className="flex flex-wrap items-stretch px-5 sm:px-6"
              style={{ borderTop: '1.5px solid var(--bd-line)', background: 'var(--bd-bg)' }}
            >
              {[replayOverviewFacts[5], replayOverviewFacts[2], replayOverviewFacts[3], replayOverviewFacts[0]]
                .filter(Boolean)
                .map((fact, i) => (
                  <div
                    key={fact.label}
                    className={`flex flex-col gap-0.5 py-3 ${i > 0 ? 'ml-4 border-l pl-4' : ''}`}
                    style={i > 0 ? { borderColor: 'var(--bd-line)' } : undefined}
                  >
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--bd-ink-muted)' }}>
                      {fact.label}
                    </dt>
                    <dd className="whitespace-nowrap text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>
                      {fact.value}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>

          {/* ── Playback controls ── */}
          <div
            className="rounded-2xl px-4 py-4 sm:px-5"
            style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg2)' }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={stepBack}
                disabled={currentIndex === 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink)' }}
                aria-label={t('profile.gameReplay.stepBack')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                disabled={snapshots.length <= 1}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--bd-ink)', color: 'white' }}
                aria-label={isPlaying ? t('profile.gameReplay.pause') : t('profile.gameReplay.play')}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={stepForward}
                disabled={currentIndex >= snapshots.length - 1}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink)' }}
                aria-label={t('profile.gameReplay.stepForward')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.28 2.14L8 14.14V9.86zM16 6h2v12h-2z" />
                </svg>
              </button>

              <div className="mx-1 min-w-0 flex-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, snapshots.length - 1)}
                  value={currentIndex}
                  onChange={(event) => onSeek(Number(event.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs tabular-nums" style={{ color: 'var(--bd-ink-muted)' }}>
                <span>
                  {t('profile.gameReplay.stepOf', {
                    current: currentIndex + 1,
                    total: snapshots.length,
                  })}
                </span>
                <span>{formatDateTime(currentSnapshot?.createdAt) || '—'}</span>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-0.5 rounded-xl p-0.5"
                  style={{ background: 'var(--bd-bg)' }}
                >
                  {REPLAY_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                      style={
                        speed === s
                          ? { background: 'var(--bd-ink)', color: 'white' }
                          : { color: 'var(--bd-ink-soft)' }
                      }
                    >
                      {s}×
                    </button>
                  ))}
                </div>

                <a
                  href={`/api/game/${gameId}/replay?download=1`}
                  className="flex h-8 w-8 items-center justify-center rounded-xl transition-opacity hover:opacity-70"
                  style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-muted)' }}
                  title={t('profile.gameReplay.download')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* ── Main grid ── */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.85fr)]">
            {/* Left column */}
            <div className="space-y-4">
              {GameRenderer && currentSnapshot && (
                <Suspense fallback={null}>
                  <GameRenderer
                    snapshotState={currentSnapshot.state}
                    players={data?.game.players ?? []}
                    playerNameById={playerNameById}
                  />
                </Suspense>
              )}

              {/* Current moment */}
              <div
                className="rounded-2xl px-4 py-4 sm:px-5"
                style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--bd-ink-muted)' }}>
                  {t('profile.gameReplay.currentStep')}
                </p>
                <h3 className="mt-2 text-xl font-semibold" style={{ color: 'var(--bd-ink)' }}>
                  {currentStepTitle}
                </h3>
                {currentStepDescription && (
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
                    {currentStepDescription}
                  </p>
                )}

                {(currentTurnLabel || winnerLabel || phaseLabel || roundValue !== null) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentTurnLabel && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                        style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-soft)' }}
                      >
                        <span style={{ color: 'var(--bd-ink-muted)' }}>{t('profile.gameReplay.currentTurn')}:</span>
                        {' '}{currentTurnLabel}
                      </span>
                    )}
                    {winnerLabel && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                        style={{ background: 'rgba(255,196,77,0.15)', color: 'var(--bd-ink)' }}
                      >
                        👑 {winnerLabel}
                      </span>
                    )}
                    {phaseLabel && (
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-soft)' }}
                      >
                        {t('profile.gameReplay.phase')}: {phaseLabel}
                      </span>
                    )}
                    {roundValue !== null && (
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-soft)' }}
                      >
                        {t('profile.gameReplay.roundValue', { value: roundValue })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Compact standings */}
              {standings.some((e) => e.score !== null) && (
                <div
                  className="flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3"
                  style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg2)' }}
                >
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--bd-ink-muted)' }}>
                    {t('profile.gameReplay.scoreboard')}
                  </span>
                  {standings.map((entry, index) => (
                    <div key={entry.id} className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                        style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-soft)' }}
                      >
                        {index + 1}
                      </span>
                      <span className="max-w-[8rem] truncate text-sm font-medium" style={{ color: 'var(--bd-ink)' }}>
                        {entry.name}
                      </span>
                      <span className="text-base font-bold" style={{ color: 'var(--bd-ink)' }}>
                        {entry.score ?? '-'}
                      </span>
                      {entry.isWinner && <span aria-hidden className="text-sm">👑</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Technical details */}
              <details
                className="overflow-hidden rounded-2xl"
                style={{ border: '1.5px solid var(--bd-line)' }}
              >
                <summary
                  className="cursor-pointer select-none px-4 py-3.5 text-sm font-medium"
                  style={{ color: 'var(--bd-ink-muted)', background: 'var(--bd-bg2)' }}
                >
                  {t('profile.gameReplay.advancedDetails')}
                </summary>
                <div className="grid gap-3 p-4 lg:grid-cols-2" style={{ background: 'var(--bd-bg)' }}>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--bd-ink-muted)' }}>
                      {t('profile.gameReplay.actionPayload')}
                    </h4>
                    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                      {currentSnapshot ? toPrettyJson(currentSnapshot.actionPayload) : 'null'}
                    </pre>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--bd-ink-muted)' }}>
                      {t('profile.gameReplay.state')}
                    </h4>
                    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                      {currentSnapshot ? toPrettyJson(currentSnapshot.state) : 'null'}
                    </pre>
                  </div>
                </div>
              </details>
            </div>

            {/* Right column — moments timeline */}
            <aside
              className="rounded-2xl px-4 py-4 sm:px-5"
              style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg2)' }}
            >
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--bd-ink-muted)' }}>
                {t('profile.gameReplay.timeline')}
              </p>
              <div className="max-h-[20rem] space-y-1 overflow-auto pr-1 sm:max-h-[24rem] xl:max-h-[42rem]">
                {snapshots.map((snapshot, index) => {
                  const snapshotActor = snapshot.playerId
                    ? playerNameById.get(snapshot.playerId) || snapshot.playerId
                    : null
                  const isActive = index === currentIndex

                  return (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => onSeek(index)}
                      className="w-full rounded-xl px-3 py-2.5 text-left transition-colors"
                      style={
                        isActive
                          ? { background: 'var(--bd-ink)', color: 'white' }
                          : { background: 'var(--bd-bg)', color: 'var(--bd-ink)' }
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {getFriendlyReplayActionLabel(snapshot.actionType, t)}
                        </span>
                        <span
                          className="shrink-0 text-xs tabular-nums"
                          style={isActive ? { color: 'rgba(255,255,255,0.65)' } : { color: 'var(--bd-ink-muted)' }}
                        >
                          {new Date(snapshot.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={isActive ? { color: 'rgba(255,255,255,0.65)' } : { color: 'var(--bd-ink-soft)' }}
                      >
                        {getCurrentStepDescription(
                          snapshotActor,
                          getActionDetail(snapshot.actionPayload, playerNameById)
                        ) || t('profile.gameReplay.system')}
                      </p>
                    </button>
                  )
                })}
              </div>
            </aside>
          </div>
        </div>
      )}
    </Modal>
  )
}
