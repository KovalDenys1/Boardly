import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { getProductMetricsDashboard, type ProductGameMetrics } from '@/lib/product-metrics'
import { canAccessProductAnalytics } from '@/lib/analytics-access'
import AnalyticsInteractiveTable, { AnalyticsTableColumn } from '@/components/AnalyticsInteractiveTable'
import GameAnalyticsSection from '@/components/GameAnalyticsSection'

export const dynamic = 'force-dynamic'

const DAILY_COLUMNS: AnalyticsTableColumn[] = [
  { key: 'date', label: 'Date', type: 'text', defaultSortDirection: 'desc' },
  { key: 'newUsers', label: 'New users', type: 'number' },
  { key: 'lobbiesCreated', label: 'Lobbies', type: 'number' },
  { key: 'lobbiesWithGameStart', label: 'Lobbies started', type: 'number' },
  { key: 'gamesStarted', label: 'Games started', type: 'number' },
  { key: 'gamesCompleted', label: 'Games completed', type: 'number' },
  { key: 'invitesSent', label: 'Invites sent', type: 'number' },
  { key: 'invitesAccepted', label: 'Invites accepted', type: 'number' },
]

const COHORT_COLUMNS: AnalyticsTableColumn[] = [
  { key: 'date', label: 'Cohort date', type: 'text', defaultSortDirection: 'desc' },
  { key: 'newUsers', label: 'New users', type: 'number' },
  { key: 'd1Eligible', label: 'D1 eligible', type: 'number' },
  { key: 'd1Returned', label: 'D1 returned', type: 'number' },
  { key: 'd1RetentionPct', label: 'D1 %', type: 'percent' },
  { key: 'd7Eligible', label: 'D7 eligible', type: 'number' },
  { key: 'd7Returned', label: 'D7 returned', type: 'number' },
  { key: 'd7RetentionPct', label: 'D7 %', type: 'percent' },
]

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatDuration(value: number): string {
  if (value <= 0) return '0s'
  if (value < 60) return `${value.toFixed(1)}s`
  return `${(value / 60).toFixed(1)}m`
}

function clampDays(rawDays: string | undefined): number {
  const parsed = rawDays ? Number(rawDays) : 7
  if (!Number.isFinite(parsed)) return 7
  return Math.min(120, Math.max(7, Math.floor(parsed)))
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/login?returnUrl=%2Fanalytics')
  }

  if (
    !canAccessProductAnalytics({
      id: session.user.id,
      email: session.user.email,
    })
  ) {
    redirect('/games')
  }

  const resolvedSearchParams = await searchParams
  const days = clampDays(resolvedSearchParams.days)
  const dashboard = await getProductMetricsDashboard(days)

  const { summary, daily, cohorts, gameMetrics, caveats } = dashboard
  const allGamesMetrics: ProductGameMetrics = {
    gameType: 'all',
    summary: {
      lobbiesCreated: summary.lobbiesCreated,
      lobbiesWithGameStart: summary.lobbiesWithGameStart,
      lobbyToGameStartPct: summary.lobbyToGameStartPct,
      gamesStarted: summary.gamesStarted,
      gamesCompleted: summary.gamesCompleted,
      gameStartToCompletePct: summary.gameStartToCompletePct,
      rematchGames: summary.rematchGames,
      rematchRatePct: summary.rematchRatePct,
      abandonedGames: summary.abandonedGames,
      abandonRatePct: summary.abandonRatePct,
      avgGameDurationSec: summary.avgGameDurationSec,
    },
    daily: daily.map((row) => ({
      date: row.date,
      lobbiesCreated: row.lobbiesCreated,
      lobbiesWithGameStart: row.lobbiesWithGameStart,
      gamesStarted: row.gamesStarted,
      gamesCompleted: row.gamesCompleted,
    })),
  }
  const gameMetricsWithAll = [allGamesMetrics, ...gameMetrics]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-bold sm:text-3xl">Product Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">
            Tracks retention, funnel conversions, and invite conversion directly from your DB.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {[7, 14, 30, 60, 90].map((option) => (
              <Link
                key={option}
                href={`/analytics?days=${option}`}
                className={`rounded-lg px-3 py-1.5 transition ${
                  days === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {option} days
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">D1 retention</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.d1RetentionPct)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">D7 retention</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.d7RetentionPct)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Lobby → game start</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.lobbyToGameStartPct)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Game start → complete</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.gameStartToCompletePct)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Invite conversion</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.inviteConversionPct)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Rematch rate</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.rematchRatePct)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {formatNumber(summary.rematchGames)} rematch games
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Abandon rate</p>
            <p className="mt-2 text-3xl font-bold">{formatPct(summary.abandonRatePct)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {formatNumber(summary.abandonedGames)} abandoned games
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Avg game duration</p>
            <p className="mt-2 text-3xl font-bold">{formatDuration(summary.avgGameDurationSec)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">New users</p>
            <p className="mt-1 text-2xl font-bold">{formatNumber(summary.totalNewUsers)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Lobbies started</p>
            <p className="mt-1 text-2xl font-bold">
              {formatNumber(summary.lobbiesWithGameStart)} / {formatNumber(summary.lobbiesCreated)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Invites accepted</p>
            <p className="mt-1 text-2xl font-bold">
              {formatNumber(summary.invitesAccepted)} / {formatNumber(summary.invitesSent)}
            </p>
          </div>
        </div>

        <AnalyticsInteractiveTable
          title="Daily Funnel"
          columns={DAILY_COLUMNS}
          rows={daily}
          rowKey="date"
        />

        <GameAnalyticsSection gameMetrics={gameMetricsWithAll} />

        <AnalyticsInteractiveTable
          title="Retention Cohorts"
          columns={COHORT_COLUMNS}
          rows={cohorts}
          rowKey="date"
        />

        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Notes</p>
          <p className="mt-2">{caveats.retentionMethod}</p>
          <p className="mt-1">{caveats.gameCompletionMethod}</p>
          <p className="mt-1">{caveats.inviteConversionMethod}</p>
          <p className="mt-1 text-amber-200/90">
            Generated at: {new Date(dashboard.generatedAt).toLocaleString('en-US')}
          </p>
        </div>
      </div>
    </div>
  )
}
