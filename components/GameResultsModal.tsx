'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { ALL_CATEGORIES, YahtzeeCategory } from '@/lib/yahtzee'
import {
  formatCompactDuration,
  formatGameTypeLabel,
  getGameStatusBadgeColor,
} from '@/lib/game-display'
import Modal from './Modal'
import LoadingSpinner from './LoadingSpinner'
import { clientLogger } from '@/lib/client-logger'

const GAME_HISTORY_STATUS_KEYS = {
  waiting: 'profile.gameHistory.waiting',
  playing: 'profile.gameHistory.playing',
  finished: 'profile.gameHistory.finished',
  abandoned: 'profile.gameHistory.abandoned',
  cancelled: 'profile.gameHistory.cancelled',
} as const satisfies Record<string, TranslationKeys>

const cardStyle: React.CSSProperties = {
  borderRadius: 24,
  border: '1.5px solid var(--bd-line)',
  background: 'var(--bd-card-warm)',
  boxShadow: '0 1px 4px #1F1B160A',
  overflow: 'hidden',
}


interface Player {
  id: string
  username: string | null
  avatar: string | null
  isBot: boolean
  isPremium?: boolean
  score: number
  finalScore: number | null
  placement: number | null
  isWinner: boolean
}

interface GameResult {
  id: string
  lobbyCode: string
  lobbyName: string
  gameType: string
  status: string
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  endedAt: string | null
  durationMs: number | null
  abandonedAt: string | null
  hasReplay: boolean
  replayStepCount: number
  players: Player[]
  state: Record<string, unknown>
}

interface GameResultsModalProps {
  gameId: string | null
  onClose: () => void
  onWatchReplay?: (gameId: string) => void
}

function getScoreValue(player: Player): number {
  return player.finalScore ?? player.score
}

function formatOrdinalPlace(place: number, locale: string): string {
  if (locale.startsWith('ru') || locale.startsWith('uk') || locale.startsWith('no')) {
    return `#${place}`
  }

  const mod10 = place % 10
  const mod100 = place % 100

  if (mod10 === 1 && mod100 !== 11) return `${place}st`
  if (mod10 === 2 && mod100 !== 12) return `${place}nd`
  if (mod10 === 3 && mod100 !== 13) return `${place}rd`

  return `${place}th`
}

export default function GameResultsModal({
  gameId,
  onClose,
  onWatchReplay,
}: GameResultsModalProps) {
  const { t } = useTranslation()
  const [game, setGame] = useState<GameResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) {
      setGame(null)
      setError(null)
      setLoading(false)
      return
    }

    const loadGameDetails = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/game/${gameId}/results`)

        if (!response.ok) {
          throw new Error('Failed to load game details')
        }

        const data = await response.json()
        setGame(data)

        clientLogger.log('Game details loaded', { gameId })
      } catch (err) {
        clientLogger.error('Error loading game details:', err)
        setError(t('errors.failedToLoad'))
      } finally {
        setLoading(false)
      }
    }

    void loadGameDetails()
  }, [gameId, t])

  if (!gameId) return null

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatStatusLabel(status: string): string {
    const key = GAME_HISTORY_STATUS_KEYS[status as keyof typeof GAME_HISTORY_STATUS_KEYS]
    if (key) {
      return t(key)
    }
    return status.replace(/_/g, ' ')
  }

  function formatShortDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  function getPlayerLabel(player: Player, index: number): string {
    const fallback = t('profile.gameReplay.playerFallback')
    return `${player.username || `${fallback} ${index + 1}`}${player.isBot ? ' \u{1F916}' : ''}`
  }

  function renderYahtzeeScorecard() {
    if (!game || game.gameType !== 'yahtzee' || !game.state?.gameData) return null

    const gameData = game.state.gameData as Record<string, unknown>
    const categories: YahtzeeCategory[] = [...ALL_CATEGORIES]

    return (
      <div style={cardStyle}>
        <div
          className="px-5 py-4 sm:px-6"
          style={{ borderBottom: '1.5px solid var(--bd-line)', background: 'var(--bd-bg2)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--bd-ink-muted)' }}>
            {t('profile.gameResults.scorecard')}
          </p>
          <h3 className="mt-2 text-lg font-bold tracking-tight" style={{ color: 'var(--bd-ink)' }}>
            {t('profile.gameResults.scorecard')}
          </h3>
        </div>

        <div className="p-5 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr style={{ background: 'var(--bd-bg2)' }}>
                  <th
                    className="px-3 py-2 text-left font-semibold"
                    style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                  >
                    {t('profile.gameResults.category')}
                  </th>
                  {game.players.map((player, index) => (
                    <th
                      key={player.id}
                      className="px-3 py-2 text-center font-semibold"
                      style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                    >
                      <span className="flex items-center justify-center gap-1">
                        {getPlayerLabel(player, index)}
                        {player.isPremium && !player.isBot && <span title="Premium">👑</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr
                    key={category}
                    style={{ background: 'var(--bd-bg)' }}
                  >
                    <td
                      className="px-3 py-2 font-medium capitalize"
                      style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                    >
                      {t(`yahtzee.categories.${category}`)}
                    </td>
                    {game.players.map((player) => {
                      const allPlayersData =
                        (gameData.players as Record<string, Record<string, unknown>> | undefined) ?? {}
                      const playerData = allPlayersData[player.id]
                      const scoresData = playerData?.scores as Record<string, unknown> | undefined
                      const score = scoresData?.[category] as number | null | undefined

                      return (
                        <td
                          key={player.id}
                          className="px-3 py-2 text-center"
                          style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                        >
                          {score !== null && score !== undefined ? score : '-'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr style={{ background: '#FFC44D22', fontWeight: 700 }}>
                  <td
                    className="px-3 py-2"
                    style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                  >
                    {t('profile.gameResults.total')}
                  </td>
                  {game.players.map((player) => (
                    <td
                      key={player.id}
                      className="px-3 py-2 text-center"
                      style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                    >
                      {getScoreValue(player)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const rankedPlayers = game
    ? [...game.players].sort((a, b) => {
        const scoreDifference = getScoreValue(b) - getScoreValue(a)
        if (scoreDifference !== 0) return scoreDifference

        const placementA = a.placement ?? Number.MAX_SAFE_INTEGER
        const placementB = b.placement ?? Number.MAX_SAFE_INTEGER
        return placementA - placementB
      })
    : []

  const winner = rankedPlayers.find((player) => player.isWinner) ?? null
  const winnerLabel = winner
    ? getPlayerLabel(winner, rankedPlayers.indexOf(winner))
    : !game
      ? ''
      : game.status === 'finished'
        ? t('profile.gameReplay.draw')
        : game.status === 'cancelled' || game.status === 'abandoned'
          ? t('profile.gameResults.noWinner')
          : t('profile.gameResults.winnerPending')

  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language
  const summaryText = game
    ? winner
      ? t('profile.gameResults.summaryWinner', { player: winnerLabel })
      : game.status === 'finished'
        ? t('profile.gameResults.summaryDraw')
        : game.status === 'cancelled'
          ? t('profile.gameResults.summaryCancelled')
          : game.status === 'abandoned'
          ? t('profile.gameResults.summaryAbandoned')
          : t('profile.gameResults.summaryInProgress')
    : ''

  const quickFacts = game
    ? [
        {
          label: t('profile.gameResults.winnerLabel'),
          value: winnerLabel,
        },
        {
          label: t('profile.gameResults.playedOn'),
          value: formatShortDate(game.createdAt),
        },
        {
          label: t('profile.gameResults.duration'),
          value: formatCompactDuration(game.durationMs, locale),
        },
        {
          label: t('profile.gameReplay.players'),
          value: String(game.players.length),
        },
      ]
    : []

  return (
    <Modal
      isOpen={!!gameId}
      onClose={onClose}
      title={game?.lobbyName || t('profile.gameResults.title')}
      maxWidth="4xl"
      mobileFullscreen
      bodyPadding="none"
    >
      {loading ? (
        <div className="flex items-center justify-center py-14">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div
          className="rounded-3xl p-5 text-sm font-medium"
          style={{
            border: '1.5px solid #FF6B5B60',
            background: '#FF6B5B10',
            color: 'var(--bd-coral)',
          }}
        >
          {error}
        </div>
      ) : game ? (
        <div className="space-y-4 p-4 sm:p-5">

          {/* ── Hero card ── */}
          <div className="overflow-hidden rounded-2xl" style={{ border: '1.5px solid var(--bd-line)' }}>
            <div
              className="px-5 py-5 sm:px-6"
              style={{
                background: winner
                  ? 'linear-gradient(145deg, rgba(255,196,77,0.15) 0%, var(--bd-bg2) 70%)'
                  : 'var(--bd-bg2)',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getGameStatusBadgeColor(game.status)}`}
                    >
                      {formatStatusLabel(game.status)}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: 'var(--bd-bg)', color: 'var(--bd-ink-soft)' }}
                    >
                      {formatGameTypeLabel(game.gameType)}
                    </span>
                  </div>
                  <p className="text-xl font-bold tracking-tight sm:text-2xl" style={{ color: 'var(--bd-ink)' }}>
                    {summaryText}
                  </p>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
                    {formatDate(game.createdAt)}
                  </p>
                </div>
                {winner && (
                  <span className="mt-1 shrink-0 text-3xl sm:text-4xl" aria-hidden>
                    👑
                  </span>
                )}
              </div>
            </div>

            <dl
              className="flex flex-wrap items-stretch px-5 sm:px-6"
              style={{ borderTop: '1.5px solid var(--bd-line)', background: 'var(--bd-bg)' }}
            >
              {quickFacts.map((fact, i) => (
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

          {/* ── Replay CTA ── */}
          {game.hasReplay ? (
            <button
              type="button"
              onClick={() => onWatchReplay?.(game.id)}
              className="flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-4 text-sm font-semibold text-white transition-all active:scale-[0.99]"
              style={{ background: 'var(--bd-ink)', boxShadow: '0 3px 0 var(--bd-coral)' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                <path d="M8 5v14l11-7z" />
              </svg>
              {t('profile.gameReplay.watch')}
            </button>
          ) : (
            <div
              className="flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm"
              style={{ background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)' }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: 'var(--bd-ink-muted)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p style={{ color: 'var(--bd-ink-soft)' }}>
                {game.status === 'abandoned'
                  ? t('profile.gameResults.replayUnavailableAbandoned')
                  : game.status === 'cancelled'
                    ? t('profile.gameResults.replayUnavailableCancelled')
                    : game.status === 'playing' || game.status === 'waiting'
                      ? t('profile.gameResults.replayUnavailableInProgress')
                      : t('profile.gameResults.replayUnavailableFinished')}
              </p>
            </div>
          )}

          {/* ── Standings ── */}
          <div>
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--bd-ink-muted)' }}>
              {t('profile.gameResults.rankings')}
            </p>
            <div className="space-y-2">
              {rankedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={
                    player.isWinner
                      ? { background: 'rgba(255,196,77,0.1)', border: '1.5px solid rgba(255,196,77,0.5)' }
                      : { background: 'var(--bd-bg)', border: '1.5px solid var(--bd-line)' }
                  }
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                    style={{ background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold" title={getPlayerLabel(player, index)}>
                      <span className="truncate">{getPlayerLabel(player, index)}</span>
                      {player.isPremium && !player.isBot && (
                        <span className="shrink-0" title="Premium">👑</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                      {player.isWinner
                        ? t('profile.gameResults.winnerBadge')
                        : player.placement
                          ? t('profile.gameResults.placeLabel', { place: formatOrdinalPlace(player.placement, locale) })
                          : formatStatusLabel(game.status)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-base font-bold" style={{ color: 'var(--bd-ink)' }}>
                      {getScoreValue(player)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                      {t('profile.gameResults.points')}
                    </span>
                    {player.isWinner && <span aria-hidden>👑</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {renderYahtzeeScorecard()}
        </div>
      ) : (
        <div className="py-14 text-center" style={{ color: 'var(--bd-ink-muted)' }}>
          {t('errors.gameNotFound')}
        </div>
      )}
    </Modal>
  )
}
