'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import Footer from '@/components/Footer'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { GAME_FILTERS, getCompactGameIcon, useLeaderboard, type LeaderboardEntry } from './use-leaderboard'
import { getGameMetadata } from '@/lib/game-catalog'
import { GAME_SVG_PATHS } from '@/components/GameIcon'
import type { TranslationKeys } from '@/lib/i18n-helpers'

const GAME_ICON_MAP: Record<string, { gameId: string; color: string }> = {
  yahtzee:            { gameId: 'yahtzee',    color: 'var(--bd-sky)' },
  guess_the_spy:      { gameId: 'spy',        color: 'var(--bd-coral)' },
  tic_tac_toe:        { gameId: 'tic-tac-toe',color: 'var(--bd-coral)' },
  rock_paper_scissors:{ gameId: 'rps',        color: 'var(--bd-lav)' },
  memory:             { gameId: 'memory',     color: 'var(--bd-mint)' },
}

function FilterGameIcon({ gameType, selected }: { gameType: string; selected: boolean }) {
  const entry = GAME_ICON_MAP[gameType]
  if (!entry || !GAME_SVG_PATHS[entry.gameId]) return null
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={20}
      height={20}
      style={{ color: selected ? 'white' : entry.color, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: GAME_SVG_PATHS[entry.gameId] }}
    />
  )
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const rankAccent = (rank: number) => {
  if (rank === 1) return 'var(--bd-sun)'
  if (rank === 2) return 'var(--bd-lav)'
  if (rank === 3) return 'var(--bd-mint)'
  return 'var(--bd-bg2)'
}

const winRateColor = (winRate: number) => {
  if (winRate >= 60) return 'var(--bd-mint-deep)'
  if (winRate >= 40) return 'var(--bd-sun-deep)'
  return 'var(--bd-ink-soft)'
}

function LeaderboardRow({ entry, isLast, t }: { entry: LeaderboardEntry; isLast: boolean; t: (key: TranslationKeys) => string }) {
  const medal = MEDAL[entry.rank]
  const isTop3 = entry.rank <= 3
  const rowClass = `grid gap-3 px-4 py-4 transition-colors sm:grid-cols-[4rem_minmax(0,1fr)_6rem_6rem_6rem_6rem] sm:items-center sm:px-5 ${
    entry.publicProfileId ? 'hover:bg-bd-card-warm' : ''
  } ${!isLast ? 'border-b border-bd-line' : ''} ${isTop3 ? 'bg-white' : 'bg-white/75'}`

  const content = (
    <>
      <div className="flex items-center gap-3 sm:block">
        <span
          className="inline-grid h-11 w-11 place-items-center rounded-2xl border-2 border-bd-ink text-sm font-extrabold text-bd-ink shadow-[2px_2px_0_#1F1B16]"
          style={{ background: rankAccent(entry.rank), fontFamily: 'var(--bd-font-display)' }}
        >
          {medal ?? entry.rank}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.rank')}</span>
      </div>
      <div className="min-w-0">
        <span className="block truncate text-base font-bold text-bd-ink">{entry.username}</span>
        {entry.publicProfileId && (
          <span className="text-xs font-semibold text-bd-ink-muted">{t('leaderboard.viewProfile')}</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:contents">
        <span className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-semibold text-bd-ink-soft sm:bg-transparent sm:p-0 sm:text-right">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.gamesPlayed')}</span>
          {entry.gamesPlayed}
        </span>
        <span className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-semibold text-bd-ink-soft sm:bg-transparent sm:p-0 sm:text-right">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.wins')}</span>
          {entry.wins}
        </span>
        <span className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-semibold text-bd-ink-soft sm:bg-transparent sm:p-0 sm:text-right">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.losses')}</span>
          {entry.losses}
        </span>
        <span
          className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-extrabold sm:bg-transparent sm:p-0 sm:text-right"
          style={{ color: winRateColor(entry.winRate) }}
        >
          <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.winRate')}</span>
          {entry.winRate}%
        </span>
      </div>
    </>
  )

  return entry.publicProfileId ? (
    <Link href={`/u/${entry.publicProfileId}`} className={rowClass}>{content}</Link>
  ) : (
    <div className={rowClass}>{content}</div>
  )
}

function LeaderboardPageContent() {
  const {
    t,
    entries,
    loading,
    error,
    hasMore,
    period,
    setPeriod,
    gameMenuOpen,
    setGameMenuOpen,
    gameMenuRef,
    selectedFilter,
    topPlayer,
    visibleWins,
    totalGamesPlayed,
    handleLoadMore,
    handleGameFilterSelect,
  } = useLeaderboard()

  return (
    <div className="bd-page bd-screen page-shell">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="grow px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">

            {/* Header */}
            <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-end">
              <div>
                <span className="bd-kicker">{t('leaderboard.hallOfFame')}</span>
                <h1
                  className="mt-3 max-w-3xl text-[clamp(2.5rem,7vw,5rem)] font-extrabold leading-[0.92] text-bd-ink"
                  style={{ fontFamily: 'var(--bd-font-display)' }}
                >
                  {t('leaderboard.title', 'Leaderboard')}
                  <span className="block text-bd-coral">{selectedFilter.label}</span>
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-bd-ink-soft sm:text-lg">
                  {t('leaderboard.subtitle', 'Top players ranked by win rate (min 10 games)')}
                </p>
              </div>
              <div className="bd-card relative overflow-hidden p-5">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full" style={{ background: 'rgba(255,196,77,0.28)' }} />
                <div className="relative flex items-center gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-3xl shadow-bd-ink-4">
                    🏆
                  </div>
                  <div className="min-w-0">
                    <p className="bd-kicker">{period === 'all' ? t('leaderboard.allTime', 'All Time') : t('leaderboard.last30days', 'Last 30 Days')}</p>
                    <p className="mt-1 truncate text-lg font-bold text-bd-ink">
                      {topPlayer?.username ?? t('leaderboard.empty', 'No qualifying players yet')}
                    </p>
                    <p className="text-sm text-bd-ink-muted">
                      {topPlayer
                        ? `${topPlayer.winRate}% ${t('leaderboard.winRate', 'Win %')}`
                        : t('leaderboard.emptyHint', 'Play at least 10 games to appear here')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex flex-wrap gap-2">
                {(['all', '30d'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`bd-chip px-4 py-2 text-sm transition-all ${
                      period === p ? 'border-bd-ink bg-bd-ink text-bd-bg' : 'hover:border-bd-ink hover:bg-white'
                    }`}
                  >
                    {p === 'all' ? t('leaderboard.allTime', 'All Time') : t('leaderboard.last30days', 'Last 30 Days')}
                  </button>
                ))}
              </div>

              <div className="flex lg:justify-end">
                <div ref={gameMenuRef} className="relative w-full sm:w-auto">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={gameMenuOpen}
                    onClick={() => setGameMenuOpen((open) => !open)}
                    className={`flex w-full min-w-64 items-center justify-between gap-4 rounded-2xl border-2 bg-white px-4 py-3 text-left shadow-[0_4px_0_#E8DDC8] transition-all sm:w-auto ${
                      gameMenuOpen
                        ? 'border-bd-ink shadow-[0_5px_0_#1F1B16]'
                        : 'border-bd-line hover:border-bd-ink hover:shadow-[0_5px_0_#1F1B16]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-bd-bg2 text-lg leading-none">
                        {selectedFilter.value && GAME_ICON_MAP[selectedFilter.value]
                          ? <FilterGameIcon gameType={selectedFilter.value} selected={false} />
                          : selectedFilter.displayIcon}
                      </span>
                      <span className="min-w-0">
                        <span className="bd-kicker block text-[10px]">{t('leaderboard.gameFilter')}</span>
                        <span className="block truncate text-sm font-bold text-bd-ink">{selectedFilter.label}</span>
                      </span>
                    </span>
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bd-bg2 text-sm font-bold text-bd-ink transition-transform ${
                        gameMenuOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>

                  {gameMenuOpen && (
                    <div
                      className="absolute right-0 z-30 mt-3 w-full min-w-72 overflow-hidden rounded-2xl border-2 border-bd-ink bg-white shadow-[0_8px_0_#1F1B16,0_18px_36px_-18px_rgba(31,27,22,0.45)] sm:w-80"
                      role="listbox"
                      aria-label={t('leaderboard.gameFilter')}
                    >
                      <div className="border-b border-bd-line bg-bd-card-warm px-4 py-3">
                        <p className="bd-kicker">{t('leaderboard.chooseGame')}</p>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-2">
                        {GAME_FILTERS.map((f) => {
                          const meta = f.value ? getGameMetadata(f.value) : null
                          const icon = f.value ? getCompactGameIcon(f.value, meta?.icon ?? f.icon) : f.displayIcon
                          const label = meta?.name ?? f.label
                          const selected = selectedFilter.value === f.value
                          return (
                            <button
                              key={f.value}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => handleGameFilterSelect(f.value)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                selected ? 'bg-bd-lav text-white' : 'text-bd-ink hover:bg-bd-card-warm'
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl text-lg leading-none ${selected ? 'bg-white/20' : 'bg-bd-bg2'}`}>
                                  {f.value && GAME_ICON_MAP[f.value]
                                    ? <FilterGameIcon gameType={f.value} selected={selected} />
                                    : icon}
                                </span>
                                <span className="truncate text-sm font-bold">{label}</span>
                              </span>
                              {selected && (
                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-bd-lav-deep">✓</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="bd-card p-4">
                <p className="bd-kicker">{t('leaderboard.players')}</p>
                <p className="mt-2 truncate text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                  {entries.length}
                </p>
              </div>
              <div className="bd-card p-4">
                <p className="bd-kicker">{t('leaderboard.wins', 'Wins')}</p>
                <p className="mt-2 truncate text-2xl font-extrabold text-bd-coral" style={{ fontFamily: 'var(--bd-font-display)' }}>
                  {visibleWins}
                </p>
              </div>
              <div className="bd-card p-4">
                <p className="bd-kicker">{t('leaderboard.gamesPlayed', 'Played')}</p>
                <p className="mt-2 truncate text-2xl font-extrabold text-bd-lav-deep" style={{ fontFamily: 'var(--bd-font-display)' }}>
                  {totalGamesPlayed}
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="bd-card overflow-hidden">
              <div className="hidden grid-cols-[4rem_minmax(0,1fr)_6rem_6rem_6rem] gap-3 border-b border-bd-line bg-bd-card-warm px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-bd-ink-muted sm:grid">
                <span>{t('leaderboard.rank')}</span>
                <span>{t('leaderboard.player', 'Player')}</span>
                <span className="text-right">{t('leaderboard.gamesPlayed', 'Played')}</span>
                <span className="text-right">{t('leaderboard.wins', 'Wins')}</span>
                <span className="text-right">{t('leaderboard.losses', 'Losses')}</span>
                <span className="text-right">{t('leaderboard.winRate', 'Win %')}</span>
              </div>

              {loading && entries.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-3xl shadow-bd-ink-4">🏆</div>
                  <p className="text-sm font-semibold text-bd-ink-muted">{t('leaderboard.loading', 'Loading leaderboard…')}</p>
                </div>
              ) : error ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-semibold text-bd-coral-deep">{error}</p>
                </div>
              ) : entries.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav text-3xl shadow-bd-ink-4">☆</div>
                  <p className="font-bold text-bd-ink">{t('leaderboard.empty', 'No qualifying players yet')}</p>
                  <p className="mt-1 text-sm text-bd-ink-muted">{t('leaderboard.emptyHint', 'Play at least 10 games to appear here')}</p>
                </div>
              ) : (
                entries.map((entry, idx) => (
                  <LeaderboardRow key={entry.userId} entry={entry} isLast={idx === entries.length - 1} t={t} />
                ))
              )}

              {hasMore && (
                <div className="border-t border-bd-line bg-bd-card-warm px-4 py-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? t('leaderboard.loading', 'Loading…') : t('leaderboard.loadMore', 'Load more')}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
        <Footer />
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LeaderboardPageContent />
    </Suspense>
  )
}
