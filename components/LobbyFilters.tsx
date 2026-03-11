'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { hasActiveLobbyFilters, LobbyFilterOptions } from '@/lib/lobby-filters'

interface LobbyFiltersProps {
  filters: LobbyFilterOptions
  onFiltersChange: (filters: LobbyFilterOptions) => void
}

export default function LobbyFilters({ filters, onFiltersChange }: LobbyFiltersProps) {
  const { t } = useTranslation()
  const [showFilters, setShowFilters] = useState(() => hasActiveLobbyFilters(filters))
  const inputClassName =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100'

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
    if (hasActiveFilters) {
      setShowFilters(true)
    }
  }, [hasActiveFilters])

  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-xl shadow-slate-200/40 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-slate-950/40 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white break-words">
              {t('lobby.filters.title')}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t('lobby.filters.search')}
            </p>
          </div>
          {hasActiveFilters && (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-100 px-2.5 text-xs font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {activeFilterCount}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-[280px]">
            <input
              type="text"
              placeholder={t('lobby.filters.searchPlaceholder')}
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className={`${inputClassName} pl-11`}
            />
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {t('lobby.filters.clearAll')}
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>
                {showFilters ? t('lobby.filters.hideFilters') : t('lobby.filters.showFilters')}
              </span>
              <svg
                className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200/70 pt-5 animate-fade-in dark:border-slate-700/70 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {t('lobby.filters.gameType')}
            </label>
            <select
              value={filters.gameType || ''}
              onChange={(e) => handleFilterChange('gameType', e.target.value || undefined)}
              className={inputClassName}
            >
              <option value="">{t('common.all')}</option>
              <option value="yahtzee">{t('games.yahtzee.title', 'Yahtzee')}</option>
              <option value="guess_the_spy">{t('games.spy.name', 'Guess the Spy')}</option>
              <option value="tic_tac_toe">{t('games.tictactoe.name', 'Tic-Tac-Toe')}</option>
              <option value="rock_paper_scissors">{t('games.rock_paper_scissors.name', 'Rock Paper Scissors')}</option>
              <option value="memory">{t('games.memory.name', 'Memory')}</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {t('lobby.filters.status')}
            </label>
            <select
              value={filters.status || 'all'}
              onChange={(e) => handleFilterChange('status', e.target.value as 'all' | 'waiting' | 'playing')}
              className={inputClassName}
            >
              <option value="all">{t('lobby.status.all')}</option>
              <option value="waiting">{t('lobby.status.waiting')}</option>
              <option value="playing">{t('lobby.status.playing')}</option>
            </select>
          </div>

          <div className="space-y-2 md:col-span-2 xl:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {t('lobby.sort.title')}
            </label>
            <div className="flex gap-2">
              <select
                value={filters.sortBy || 'createdAt'}
                onChange={(e) => handleFilterChange('sortBy', e.target.value as 'createdAt' | 'playerCount' | 'name')}
                className={`${inputClassName} flex-1`}
              >
                <option value="createdAt">{t('lobby.sort.createdAt')}</option>
                <option value="playerCount">{t('lobby.sort.playerCount')}</option>
                <option value="name">{t('lobby.sort.name')}</option>
              </select>
              <button
                onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
                title={filters.sortOrder === 'asc' ? t('lobby.sort.asc') : t('lobby.sort.desc')}
              >
                <svg
                  className={`h-5 w-5 transition-transform ${filters.sortOrder === 'asc' ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {t('lobby.filters.minPlayers')}
            </label>
            <input
              type="number"
              min="1"
              max="8"
              placeholder="1"
              value={filters.minPlayers || ''}
              onChange={(e) => handleFilterChange('minPlayers', e.target.value ? parseInt(e.target.value) : undefined)}
              className={inputClassName}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {t('lobby.filters.maxPlayers')}
            </label>
            <input
              type="number"
              min="1"
              max="8"
              placeholder="8"
              value={filters.maxPlayers || ''}
              onChange={(e) => handleFilterChange('maxPlayers', e.target.value ? parseInt(e.target.value) : undefined)}
              className={inputClassName}
            />
          </div>
        </div>
      )}
    </div>
  )
}
