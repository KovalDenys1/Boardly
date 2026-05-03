'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { hasActiveLobbyFilters, LobbyFilterOptions } from '@/lib/lobby-filters'

interface LobbyFiltersProps {
  filters: LobbyFilterOptions
  onFiltersChange: (filters: LobbyFilterOptions) => void
  embedded?: boolean
}

export default function LobbyFilters({ filters, onFiltersChange, embedded = false }: LobbyFiltersProps) {
  const { t } = useTranslation()
  const [showFilters, setShowFilters] = useState(() => hasActiveLobbyFilters(filters))

  const handleFilterChange = (key: keyof LobbyFilterOptions, value: LobbyFilterOptions[typeof key]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const clearAllFilters = () => {
    onFiltersChange({
      gameType: undefined,
      status: 'all',
      search: '',
      minPlayers: undefined,
      maxPlayers: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
  }

  const hasActiveFilters = hasActiveLobbyFilters(filters)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.gameType) count += 1
    if (filters.status && filters.status !== 'all') count += 1
    if (filters.search) count += 1
    if (filters.minPlayers) count += 1
    if (filters.maxPlayers) count += 1
    return count
  }, [filters.gameType, filters.maxPlayers, filters.minPlayers, filters.search, filters.status])

  useEffect(() => {
    if (hasActiveFilters) setShowFilters(true)
  }, [hasActiveFilters])

  const chip = (active: boolean) =>
    `bd-chip cursor-pointer px-3.5 py-1.5 text-sm transition-all ${
      active ? 'border-bd-ink bg-bd-ink text-bd-bg' : 'hover:border-bd-ink hover:bg-white'
    }`

  const gameTypes: { value: string | undefined; label: string }[] = [
    { value: undefined, label: t('common.all') },
    { value: 'yahtzee', label: t('games.yahtzee.title', 'Yahtzee') },
    { value: 'guess_the_spy', label: t('games.spy.name', 'Guess the Spy') },
    { value: 'tic_tac_toe', label: t('games.tictactoe.name', 'Tic-Tac-Toe') },
    { value: 'memory', label: t('games.memory.name', 'Memory') },
  ]

  const statusOptions = [
    { value: 'all' as const, label: t('lobby.status.all') },
    { value: 'waiting' as const, label: t('lobby.status.waiting') },
    { value: 'playing' as const, label: t('lobby.status.playing') },
  ]

  const sortOptions = [
    { value: 'playerCount' as const, label: t('lobby.sort.playerCount') },
    { value: 'name' as const, label: t('lobby.sort.name') },
  ]

  const content = (
    <>
      {/* Search + toggle row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            placeholder={t('lobby.filters.searchPlaceholder')}
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full rounded-2xl border-2 border-bd-line bg-white py-2.5 pl-10 pr-4 text-sm text-bd-ink outline-none transition placeholder:text-bd-ink-muted focus:border-bd-ink"
          />
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bd-ink-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="bd-btn bd-btn-soft px-3.5 py-2.5 text-sm">
              {t('lobby.filters.clearAll')}
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`bd-chip flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-all ${
              showFilters ? 'border-bd-ink bg-bd-ink text-bd-bg' : 'hover:border-bd-ink hover:bg-white'
            }`}
          >
            {showFilters ? t('lobby.filters.hideFilters') : t('lobby.filters.showFilters')}
            {hasActiveFilters && !showFilters && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-bd-coral px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
            <span className={`text-xs transition-transform ${showFilters ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 space-y-5 border-t border-bd-line pt-4">
          {/* Game type chips */}
          <div>
            <span className="bd-kicker mb-2.5 block">{t('lobby.filters.gameType')}</span>
            <div className="flex flex-wrap gap-2">
              {gameTypes.map((g) => (
                <button
                  key={g.value ?? '__all'}
                  onClick={() => handleFilterChange('gameType', g.value)}
                  className={chip(filters.gameType === g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status + Sort row */}
          <div className="flex flex-wrap gap-x-8 gap-y-5">
            <div>
              <span className="bd-kicker mb-2.5 block">{t('lobby.filters.status')}</span>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleFilterChange('status', s.value)}
                    className={chip((filters.status ?? 'all') === s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="bd-kicker mb-2.5 block">{t('lobby.sort.title')}</span>
              <div className="flex flex-wrap items-center gap-2">
                {sortOptions.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleFilterChange('sortBy', s.value)}
                    className={chip((filters.sortBy ?? 'createdAt') === s.value)}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="bd-chip flex h-9 w-9 cursor-pointer items-center justify-center text-base transition-all hover:border-bd-ink hover:bg-white"
                  title={filters.sortOrder === 'asc' ? t('lobby.sort.asc') : t('lobby.sort.desc')}
                >
                  {filters.sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>

            <div>
              <span className="bd-kicker mb-2.5 block">{t('lobby.filters.playerCount')}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="8"
                  placeholder="1"
                  value={filters.minPlayers || ''}
                  onChange={(e) => handleFilterChange('minPlayers', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-20 rounded-2xl border-2 border-bd-line bg-white px-3 py-2 text-center text-sm text-bd-ink outline-none transition focus:border-bd-ink"
                />
                <span className="text-sm text-bd-ink-muted">–</span>
                <input
                  type="number"
                  min="1"
                  max="8"
                  placeholder="8"
                  value={filters.maxPlayers || ''}
                  onChange={(e) => handleFilterChange('maxPlayers', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-20 rounded-2xl border-2 border-bd-line bg-white px-3 py-2 text-center text-sm text-bd-ink outline-none transition focus:border-bd-ink"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (embedded) return content

  return (
    <div className="bd-card p-5 sm:p-6">
      {content}
    </div>
  )
}
