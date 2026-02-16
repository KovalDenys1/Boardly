import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { getProductMetricsDashboard } from '@/lib/product-metrics'
import { canAccessProductAnalytics } from '@/lib/analytics-access'

export const dynamic = 'force-dynamic'

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function clampDays(rawDays: string | undefined): number {
  const parsed = rawDays ? Number(rawDays) : 30
  if (!Number.isFinite(parsed)) return 30
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

  const { summary, daily, cohorts, caveats } = dashboard

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-bold sm:text-3xl">Product Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">
            Tracks retention, funnel conversions, and invite conversion directly from your DB.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {[14, 30, 60, 90].map((option) => (
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Daily Funnel</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-slate-400">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">New users</th>
                  <th className="px-3 py-2">Lobbies</th>
                  <th className="px-3 py-2">Lobbies started</th>
                  <th className="px-3 py-2">Games started</th>
                  <th className="px-3 py-2">Games completed</th>
                  <th className="px-3 py-2">Invites sent</th>
                  <th className="px-3 py-2">Invites accepted</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.date} className="border-b border-white/5">
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{formatNumber(row.newUsers)}</td>
                    <td className="px-3 py-2">{formatNumber(row.lobbiesCreated)}</td>
                    <td className="px-3 py-2">{formatNumber(row.lobbiesWithGameStart)}</td>
                    <td className="px-3 py-2">{formatNumber(row.gamesStarted)}</td>
                    <td className="px-3 py-2">{formatNumber(row.gamesCompleted)}</td>
                    <td className="px-3 py-2">{formatNumber(row.invitesSent)}</td>
                    <td className="px-3 py-2">{formatNumber(row.invitesAccepted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Retention Cohorts</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-slate-400">
                  <th className="px-3 py-2">Cohort date</th>
                  <th className="px-3 py-2">New users</th>
                  <th className="px-3 py-2">D1 eligible</th>
                  <th className="px-3 py-2">D1 returned</th>
                  <th className="px-3 py-2">D1 %</th>
                  <th className="px-3 py-2">D7 eligible</th>
                  <th className="px-3 py-2">D7 returned</th>
                  <th className="px-3 py-2">D7 %</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((row) => (
                  <tr key={row.date} className="border-b border-white/5">
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{formatNumber(row.newUsers)}</td>
                    <td className="px-3 py-2">{formatNumber(row.d1Eligible)}</td>
                    <td className="px-3 py-2">{formatNumber(row.d1Returned)}</td>
                    <td className="px-3 py-2">{formatPct(row.d1RetentionPct)}</td>
                    <td className="px-3 py-2">{formatNumber(row.d7Eligible)}</td>
                    <td className="px-3 py-2">{formatNumber(row.d7Returned)}</td>
                    <td className="px-3 py-2">{formatPct(row.d7RetentionPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Notes</p>
          <p className="mt-2">{caveats.retentionMethod}</p>
          <p className="mt-1">{caveats.inviteConversionMethod}</p>
          <p className="mt-1 text-amber-200/90">
            Generated at: {new Date(dashboard.generatedAt).toLocaleString('en-US')}
          </p>
        </div>
      </div>
    </div>
  )
}
