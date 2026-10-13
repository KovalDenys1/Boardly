'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { formatCompactDuration } from '@/lib/game-display'
import { formatRelativeTime } from '@/lib/format-relative-time'
import { gameNameKey } from '@/lib/game-name-key'
import { getCatalogGames, getGameMetadata, isAvailableCatalogEntry, type AvailableGameCatalogEntry } from '@/lib/game-catalog'
import { Icon } from '@/components/icons'
import GameIcon from '@/components/GameIcon'
import LoadingSpinner from './LoadingSpinner'
import GameResultsModal from './GameResultsModal'
import BoardlySelect from './ui/BoardlySelect'

const GAME_HISTORY_STATUS_KEYS = {
  waiting: 'profile.gameHistory.waiting',
  playing: 'profile.gameHistory.playing',
  finished: 'profile.gameHistory.finished',
  abandoned: 'profile.gameHistory.abandoned',
  cancelled: 'profile.gameHistory.cancelled',
} as const satisfies Record<string, TranslationKeys>

type ViewerResult = 'won' | 'lost' | 'draw' | 'abandoned' | 'cancelled' | 'inProgress'

const RESULT_KEYS = {
  won: 'profile.gameHistory.result.won',
  lost: 'profile.gameHistory.result.lost',
  draw: 'profile.gameHistory.result.draw',
  abandoned: 'profile.gameHistory.result.abandoned',
  cancelled: 'profile.gameHistory.result.cancelled',
  inProgress: 'profile.gameHistory.result.inProgress',
} as const satisfies Record<ViewerResult, TranslationKeys>

const RESULT_BADGE_CLASS: Record<ViewerResult, string> = {
  won: 'bg-bd-mint text-bd-ink',
  lost: 'bg-bd-coral/20 text-bd-ink',
  draw: 'bg-bd-sun/40 text-bd-ink',
  abandoned: 'bg-bd-bg2 text-bd-ink-soft',
  cancelled: 'bg-bd-bg2 text-bd-ink-soft',
  inProgress: 'bg-bd-lav/20 text-bd-ink',
}

let catalogGamesCache: AvailableGameCatalogEntry[] | null = null
function availableCatalogGames(): AvailableGameCatalogEntry[] {
  catalogGamesCache ??= getCatalogGames().filter(isAvailableCatalogEntry)
  return catalogGamesCache
}
const STATUS_FILTER_OPTIONS = ['all', 'finished', 'playing', 'abandoned', 'cancelled'] as const

const panelClassName =
  'rounded-[1.75rem] border-[1.5px] border-bd-line bg-bd-card-warm shadow-bd-soft'
const warmSurfaceClassName =
  'rounded-3xl border border-bd-line bg-bd-bg'
const secondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm px-4 py-2.5 text-sm font-semibold text-bd-ink shadow-[0_3px_0_var(--bd-line)] transition-transform hover:-translate-y-0.5 hover:bg-bd-bg2 disabled:cursor-not-allowed disabled:opacity-50'
const eyebrowClassName =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-bd-ink-soft'
const focusRing = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50'

interface Player {
  id: string
  userId: string
  isViewer: boolean
  username: string | null
  isPremium?: boolean
  isBot: boolean
  score: number
  finalScore: number | null
  placement: number | null
  isWinner: boolean
}

interface GameHistoryItem {
  id: string
  /** Null once the lobby's code has been retired by the retention rule (#1130). */
  lobbyCode: string | null
  lobbyName: string
  gameType: string
  status: string
  createdAt: string
  updatedAt: string
  abandonedAt: string | null
  durationMs: number | null
  viewerResult: ViewerResult
  hasReplay: boolean
  players: Player[]
}

interface GameHistoryResponse {
  games: GameHistoryItem[]
  pagination: {
    limit: number
    offset: number
    totalCount: number
    hasMore: boolean
    capped?: boolean
    hiddenCount?: number
  }
}

function BoardIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 3v18" />
    </svg>
  )
}

function ReplayIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </svg>
  )
}

export default function GameHistory() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [games, setGames] = useState<GameHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [gameTypeFilter, setGameTypeFilter] = useState<string>('all')
  const [offset, setOffset] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)

  const limit = 20

  const loadGames = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (gameTypeFilter !== 'all') params.set('gameType', gameTypeFilter)

      const response = await fetch(`/api/user/games?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to load game history')
      }

      const data: GameHistoryResponse = await response.json()
      setGames(data.games)
      setTotalCount(data.pagination.totalCount)
      setHasMore(data.pagination.hasMore)
      setHiddenCount(data.pagination.capped ? data.pagination.hiddenCount ?? 0 : 0)

      clientLogger.log('Game history loaded', { count: data.games.length })
    } catch (err) {
      clientLogger.error('Error loading game history:', err)
      setError(t('errors.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [gameTypeFilter, offset, statusFilter, t])

  useEffect(() => {
    void loadGames()
  }, [loadGames])

  function handleStatusFilterChange(status: string) {
    setStatusFilter(status)
    setOffset(0)
  }

  function handleGameTypeFilterChange(gameType: string) {
    setGameTypeFilter(gameType)
    setOffset(0)
  }

  function formatStatusLabel(status: string): string {
    if (status === 'all') return t('profile.gameHistory.allStatuses')
    const key = GAME_HISTORY_STATUS_KEYS[status as keyof typeof GAME_HISTORY_STATUS_KEYS]
    return key ? t(key) : status.replace(/_/g, ' ')
  }

  function gameName(gameType: string): string {
    const key = gameNameKey(gameType)
    return key ? t(key) : gameType.replace(/_/g, ' ')
  }

  function getVisibleRangeLabel(): string {
    if (totalCount === 0) return t('profile.gameHistory.noGames')
    return t('profile.gameHistory.showing', {
      start: offset + 1,
      end: Math.min(offset + limit, totalCount),
      total: totalCount,
    })
  }

  if (loading && games.length === 0) {
    return (
      <div className={`${panelClassName} flex min-h-[220px] items-center justify-center`}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="stack-y-6">
      <GameResultsModal gameId={selectedGameId} onClose={() => setSelectedGameId(null)} />

      <div className={`${panelClassName} overflow-hidden`}>
        <div className="relative p-6 sm:p-7">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative">
            <p className={eyebrowClassName}>{t('profile.gameHistory.title')}</p>
            <h2 className="mt-3 font-display text-3xl font-bold text-bd-ink">
              {t('profile.gameHistory.title')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-bd-ink-soft">{getVisibleRangeLabel()}</p>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className={`${warmSurfaceClassName} p-4 sm:p-5`}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
              <fieldset className="min-w-0">
                <legend className={eyebrowClassName}>{t('profile.gameHistory.gameType')}</legend>
                <div className="mt-3 max-w-sm lg:max-w-md">
                  <BoardlySelect
                    value={gameTypeFilter}
                    onChange={handleGameTypeFilterChange}
                    ariaLabel={t('profile.gameHistory.gameType')}
                    options={[
                      { value: 'all', label: t('profile.gameHistory.allGames') },
                      ...availableCatalogGames().map((game) => ({ value: game.gameType, label: gameName(game.gameType) })),
                    ]}
                    renderValue={(option) => (
                      <span className={gameTypeFilter !== 'all' ? 'block truncate font-semibold text-bd-ink' : 'block truncate'}>
                        {option?.label ?? ''}
                      </span>
                    )}
                  />
                </div>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className={eyebrowClassName}>{t('profile.gameHistory.status')}</legend>
                <div className="mt-3 max-w-sm">
                  <BoardlySelect
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                    ariaLabel={t('profile.gameHistory.status')}
                    options={STATUS_FILTER_OPTIONS.map((option) => ({
                      value: option,
                      label: formatStatusLabel(option),
                    }))}
                    renderValue={(option) => (
                      <span className={statusFilter !== 'all' ? 'block truncate font-semibold text-bd-ink' : 'block truncate'}>
                        {option?.label ?? ''}
                      </span>
                    )}
                  />
                </div>
              </fieldset>
            </div>
          </div>

          {error ? (
            <div className="overflow-hidden rounded-3xl border border-bd-coral/40 bg-bd-coral/10">
              <div className="border-l-4 border-bd-coral px-5 py-5 sm:px-6">
                <p className="text-sm font-semibold text-bd-ink">{error}</p>
              </div>
            </div>
          ) : null}

          {games.length === 0 && !loading ? (
            <div className={`${panelClassName} relative overflow-hidden`}>
              <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
              <div className="relative p-6 sm:p-7">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.15rem] border-2 border-bd-ink bg-bd-sun text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]">
                  <BoardIcon />
                </div>
                <h3 className="mt-5 font-display text-2xl font-bold text-bd-ink">
                  {t('profile.gameHistory.noGames')}
                </h3>
                <p className="mt-2 max-w-xl text-sm text-bd-ink-soft sm:text-base">{getVisibleRangeLabel()}</p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {games.map((game) => {
                const meta = getGameMetadata(game.gameType)
                const opponents = game.players.filter((player) => !player.isViewer)
                const whenAndHowLong = [
                  formatRelativeTime(game.createdAt, locale),
                  game.durationMs != null && game.status !== 'playing' && game.status !== 'waiting'
                    ? formatCompactDuration(game.durationMs, locale)
                    : null,
                ].filter(Boolean).join(' · ')

                return (
                  <li
                    key={game.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-bd-line bg-bd-card-warm p-3 sm:gap-4 sm:p-4"
                  >
                    {meta ? (
                      <GameIcon gameId={meta.svgId} accentColor={meta.accentColor} size={20} variant="tile" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-bd-ink">
                        <BoardIcon />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedGameId(game.id)}
                      className={`min-w-0 rounded-xl text-left ${focusRing}`}
                      aria-label={`${gameName(game.gameType)}: ${t('profile.gameHistory.clickToView')}`}
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-base font-bold text-bd-ink">{gameName(game.gameType)}</span>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] ${RESULT_BADGE_CLASS[game.viewerResult] ?? RESULT_BADGE_CLASS.inProgress}`}>
                          {t(RESULT_KEYS[game.viewerResult] ?? RESULT_KEYS.inProgress)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-bd-ink-soft">
                        {opponents.length === 0 ? (
                          <span>{t('profile.gameHistory.soloGame')}</span>
                        ) : (
                          opponents.map((player, index) => (
                            <span key={player.id} className="inline-flex max-w-full items-center gap-1">
                              <span className="truncate">{player.username || t('profile.gameReplay.playerFallback')}</span>
                              {player.isBot && (
                                <span className="rounded-full bg-bd-bg2 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.12em] text-bd-ink-soft">
                                  {t('profile.gameReplay.bot')}
                                </span>
                              )}
                              {player.isPremium && !player.isBot && <Icon name="crown" size={12} tone="premium" label="Premium" className="shrink-0" />}
                              {index < opponents.length - 1 && <span aria-hidden>,</span>}
                            </span>
                          ))
                        )}
                        <span className="shrink-0 before:mr-1.5 before:content-['·']">{whenAndHowLong}</span>
                      </span>
                    </button>

                    {game.hasReplay ? (
                      <Link
                        href={`/replay/${game.id}`}
                        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-3 text-sm font-bold text-(--bd-ink-on-accent) shadow-[0_3px_0_var(--bd-lav-deep)] transition-transform hover:-translate-y-0.5 sm:px-4 ${focusRing}`}
                        aria-label={`${t('profile.gameReplay.watch')}: ${gameName(game.gameType)}`}
                      >
                        <ReplayIcon />
                        <span className="hidden sm:inline">{t('profile.gameReplay.watch')}</span>
                      </Link>
                    ) : (
                      <span className="w-11 shrink-0" aria-hidden />
                    )}
                  </li>
                )
              })}
              {hiddenCount > 0 && (
                <li className="px-1 pt-1 text-sm text-bd-ink-soft">
                  <Link href="/profile?tab=premium" className={`font-semibold text-bd-lav-deep underline-offset-2 hover:underline ${focusRing}`}>
                    {t('profile.gameHistory.moreWithPremium', { count: hiddenCount })}
                  </Link>
                </li>
              )}
            </ul>
          )}

          {(offset > 0 || hasMore) && (
            <div className={`${warmSurfaceClassName} p-4 sm:p-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className={secondaryButtonClassName}>
                  {t('common.previous')}
                </button>
                <span className="text-center text-sm text-bd-ink-soft">{getVisibleRangeLabel()}</span>
                <button type="button" onClick={() => hasMore && setOffset(offset + limit)} disabled={!hasMore} className={secondaryButtonClassName}>
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
