'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

export interface LobbyFilterOptions {
  gameType?: string
  status?: 'all' | 'waiting' | 'playing'
  search?: string
  minPlayers?: number
  maxPlayers?: number
  sortBy?: 'createdAt' | 'playerCount' | 'name'
  sortOrder?: 'asc' | 'desc'
}

interface LobbyFiltersProps {
  filters: LobbyFilterOptions
  onFiltersChange: (filters: LobbyFilterOptions) => void
}

export default function LobbyFilters({ filters, onFiltersChange }: LobbyFiltersProps) {
  const { t } = useTranslation()
  const [showFilters, setShowFilters] = useState(false)

  const handleFilterChange = (key: keyof LobbyFilterOptions, value: any) => {
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

  const hasActiveFilters = filters.gameType || filters.status !== 'all' || filters.search || filters.minPlayers || filters.maxPlayers

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
      {/* Header with toggle button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            🔍 {t('lobby.filters.title')}
          </h3>
          {hasActiveFilters && (
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t('lobby.filters.clearAll')}
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {showFilters ? t('lobby.filters.hideFilters') : t('lobby.filters.showFilters')}
            </span>
            <svg
              className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${showFilters ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search bar (always visible) */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder={t('lobby.filters.searchPlaceholder')}
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full px-4 py-3 pl-10 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Collapsible filters */}
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700 animate-fade-in">
          {/* Game Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('lobby.filters.gameType')}
            </label>
            <select
              value={filters.gameType || ''}
              onChange={(e) => handleFilterChange('gameType', e.target.value || undefined)}
              className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">{t('common.all')}</option>
              <option value="yahtzee">{t('games.yahtzee.title', 'Yahtzee')}</option>
              <option value="guess_the_spy">{t('games.spy.name', 'Guess the Spy')}</option>
              <option value="tic_tac_toe">{t('games.tictactoe.name', 'Tic-Tac-Toe')}</option>
              <option value="rock_paper_scissors">{t('games.rock_paper_scissors.name', 'Rock Paper Scissors')}</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('lobby.filters.status')}
            </label>
            <select
              value={filters.status || 'all'}
              onChange={(e) => handleFilterChange('status', e.target.value as 'all' | 'waiting' | 'playing')}
              className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">{t('lobby.status.all')}</option>
              <option value="waiting">{t('lobby.status.waiting')}</option>
              <option value="playing">{t('lobby.status.playing')}</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('lobby.sort.title')}
            </label>
            <div className="flex gap-2">
              <select
                value={filters.sortBy || 'createdAt'}
                onChange={(e) => handleFilterChange('sortBy', e.target.value as 'createdAt' | 'playerCount' | 'name')}
                className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="createdAt">{t('lobby.sort.createdAt')}</option>
                <option value="playerCount">{t('lobby.sort.playerCount')}</option>
                <option value="name">{t('lobby.sort.name')}</option>
              </select>
              <button
                onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={filters.sortOrder === 'asc' ? t('lobby.sort.asc') : t('lobby.sort.desc')}
              >
                <svg
                  className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${filters.sortOrder === 'asc' ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Min Players */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('lobby.filters.minPlayers')}
            </label>
            <input
              type="number"
              min="1"
              max="8"
              placeholder="1"
              value={filters.minPlayers || ''}
              onChange={(e) => handleFilterChange('minPlayers', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Max Players */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('lobby.filters.maxPlayers')}
            </label>
            <input
              type="number"
              min="1"
              max="8"
              placeholder="8"
              value={filters.maxPlayers || ''}
              onChange={(e) => handleFilterChange('maxPlayers', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      )}
    </div>
  )
}
