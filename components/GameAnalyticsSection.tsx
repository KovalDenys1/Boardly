'use client'

import { useMemo, useState } from 'react'
import AnalyticsInteractiveTable, { AnalyticsTableColumn } from '@/components/AnalyticsInteractiveTable'
import type { ProductGameMetrics } from '@/lib/product-metrics'

const GAME_DAILY_COLUMNS: AnalyticsTableColumn[] = [
  { key: 'date', label: 'Date', type: 'text', defaultSortDirection: 'desc' },
  { key: 'lobbiesCreated', label: 'Lobbies', type: 'number' },
  { key: 'lobbiesWithGameStart', label: 'Lobbies started', type: 'number' },
  { key: 'gamesStarted', label: 'Games started', type: 'number' },
  { key: 'gamesCompleted', label: 'Games completed', type: 'number' },
]

const GAME_TYPE_LABELS: Record<string, string> = {
  all: 'All games',
  yahtzee: 'Yahtzee',
  guess_the_spy: 'Guess the Spy',
  tic_tac_toe: 'Tic-Tac-Toe',
  rock_paper_scissors: 'Rock Paper Scissors',
}

function formatGameTypeLabel(gameType: string): string {
  return GAME_TYPE_LABELS[gameType] ?? gameType.replace(/_/g, ' ')
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatDuration(value: number): string {
  if (value <= 0) return '0s'
  if (value < 60) return `${value.toFixed(1)}s`
  return `${(value / 60).toFixed(1)}m`
}

interface GameAnalyticsSectionProps {
  gameMetrics: ProductGameMetrics[]
}

export default function GameAnalyticsSection({ gameMetrics }: GameAnalyticsSectionProps) {
  const [selectedGameType, setSelectedGameType] = useState<string>(gameMetrics[0]?.gameType ?? '')

  const selectedMetrics = useMemo(() => {
    return gameMetrics.find((metrics) => metrics.gameType === selectedGameType) ?? gameMetrics[0]
  }, [gameMetrics, selectedGameType])

  if (!selectedMetrics) {
    return null
  }

  const selectedGameLabel = formatGameTypeLabel(selectedMetrics.gameType)

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Game Breakdown</h2>
          <p className="mt-1 text-sm text-slate-300">
            Choose a game and inspect daily funnel metrics only for that game.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          <span className="text-xs uppercase tracking-wider text-slate-400">Game</span>
          <select
            value={selectedMetrics.gameType}
            onChange={(event) => setSelectedGameType(event.target.value)}
            className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 outline-none transition focus:border-blue-400"
          >
            {gameMetrics.map((metrics) => (
              <option key={metrics.gameType} value={metrics.gameType}>
                {formatGameTypeLabel(metrics.gameType)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Lobby to start</p>
          <p className="mt-1 text-lg font-semibold">
            {formatNumber(selectedMetrics.summary.lobbiesWithGameStart)} /{' '}
            {formatNumber(selectedMetrics.summary.lobbiesCreated)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Game completion</p>
          <p className="mt-1 text-lg font-semibold">
            {formatNumber(selectedMetrics.summary.gamesCompleted)} /{' '}
            {formatNumber(selectedMetrics.summary.gamesStarted)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Start to complete</p>
          <p className="mt-1 text-lg font-semibold">
            {formatPct(selectedMetrics.summary.gameStartToCompletePct)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Rematch rate</p>
          <p className="mt-1 text-lg font-semibold">
            {formatPct(selectedMetrics.summary.rematchRatePct)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {formatNumber(selectedMetrics.summary.rematchGames)} rematch games
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Abandon rate</p>
          <p className="mt-1 text-lg font-semibold">
            {formatPct(selectedMetrics.summary.abandonRatePct)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {formatNumber(selectedMetrics.summary.abandonedGames)} abandoned games
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Avg game duration</p>
          <p className="mt-1 text-lg font-semibold">
            {formatDuration(selectedMetrics.summary.avgGameDurationSec)}
          </p>
        </div>
      </div>

      <AnalyticsInteractiveTable
        title={`Daily Metrics — ${selectedGameLabel}`}
        columns={GAME_DAILY_COLUMNS}
        rows={selectedMetrics.daily}
        rowKey="date"
      />
    </div>
  )
}
