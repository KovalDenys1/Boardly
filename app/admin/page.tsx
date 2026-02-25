import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

export default async function AdminDashboardPage() {
  const admin = await requireAdminSession('/admin')
  const sentryOrg = process.env.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT
  const sentryUrl =
    sentryOrg && sentryProject ? `https://${sentryOrg}.sentry.io/issues/?project=${encodeURIComponent(sentryProject)}` : null

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    activeUsers24h,
    suspendedUsers,
    totalGames,
    gamesInProgress,
    abandonedGames,
    activeLobbies,
    recentUsers,
    recentGames,
  ] = await Promise.all([
    prisma.users.count({ where: { isGuest: false } }),
    prisma.users.count({ where: { lastActiveAt: { gte: since24h } } }),
    prisma.users.count({ where: { suspended: true } }),
    prisma.games.count(),
    prisma.games.count({ where: { status: 'playing' } }),
    prisma.games.count({ where: { status: 'abandoned' } }),
    prisma.lobbies.count({ where: { isActive: true } }),
    prisma.users.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        suspended: true,
        isGuest: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.games.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        status: true,
        gameType: true,
        updatedAt: true,
        lobby: {
          select: {
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            players: true,
          },
        },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Overview</h2>
            <p className="text-sm text-slate-300">
              Snapshot of platform activity with direct links into admin user/game tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/admin/users" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
              Manage users
            </Link>
            <Link href="/admin/games" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
              Manage games
            </Link>
            <Link href="/admin/audit-logs" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
              Audit logs
            </Link>
            {sentryUrl ? (
              <a
                href={sentryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
              >
                Sentry issues
              </a>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Admin: {admin.username || admin.email || admin.id}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Registered users" value={formatNumber(totalUsers)} hint="Non-guest accounts" />
        <StatCard label="Active users (24h)" value={formatNumber(activeUsers24h)} />
        <StatCard label="Suspended users" value={formatNumber(suspendedUsers)} />
        <StatCard label="Games total" value={formatNumber(totalGames)} />
        <StatCard label="Games in progress" value={formatNumber(gamesInProgress)} />
        <StatCard label="Abandoned games" value={formatNumber(abandonedGames)} />
        <StatCard label="Active lobbies" value={formatNumber(activeLobbies)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Users</h2>
            <Link href="/admin/users" className="text-xs text-cyan-300 hover:text-cyan-200">
              Open users
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 pr-3">User</th>
                  <th className="pb-2 pr-3">Role</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/users/${user.id}`} className="font-medium text-white hover:text-cyan-300">
                        {user.username || user.email || user.id}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {user.isGuest ? 'guest' : 'registered'} · created {user.createdAt.toLocaleDateString('en-US')}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs">
                        {user.role}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-md px-2 py-1 text-xs ${
                          user.suspended
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-emerald-500/20 text-emerald-200'
                        }`}
                      >
                        {user.suspended ? 'suspended' : 'active'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-300">{user.lastActiveAt.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Games</h2>
            <Link href="/admin/games" className="text-xs text-cyan-300 hover:text-cyan-200">
              Open games
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 pr-3">Game</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Players</th>
                  <th className="pb-2">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentGames.map((game) => (
                  <tr key={game.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/games/${game.id}`} className="font-medium text-white hover:text-cyan-300">
                        {game.gameType}
                      </Link>
                      <div className="text-xs text-slate-400">
                        Lobby {game.lobby.code} · {game.lobby.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{game.status}</td>
                    <td className="py-2 pr-3 text-slate-300">{game._count.players}</td>
                    <td className="py-2 text-slate-300">{game.updatedAt.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-5 text-sm text-amber-100">
        <p className="font-semibold">Progress on issue #43</p>
        <p className="mt-2">
          Foundation auth/roles, admin overview, admin APIs, audit logging, and admin list/detail pages are in place.
          Remaining work includes delete/reset actions, richer moderation tooling, and broader operational integrations.
        </p>
      </section>
    </div>
  )
}
