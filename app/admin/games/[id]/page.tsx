import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminSession } from '@/lib/admin-auth'
import AdminForceEndGameButton from '../../_components/AdminForceEndGameButton'

export const dynamic = 'force-dynamic'

export default async function AdminGameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession('/admin/games')
  const { id } = await params

  const game = await prisma.games.findUnique({
    where: { id },
    select: {
      id: true,
      gameType: true,
      status: true,
      state: true,
      createdAt: true,
      updatedAt: true,
      lastMoveAt: true,
      abandonedAt: true,
      currentTurn: true,
      lobby: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          creatorId: true,
          creator: {
            select: { id: true, username: true, email: true },
          },
        },
      },
      players: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          userId: true,
          position: true,
          score: true,
          finalScore: true,
          placement: true,
          isReady: true,
          isWinner: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true,
              suspended: true,
            },
          },
        },
      },
    },
  })

  if (!game) notFound()

  let statePreview = game.state
  if (statePreview.length > 5000) {
    statePreview = `${statePreview.slice(0, 5000)}\n... (truncated)`
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{game.gameType}</h2>
              <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs">{game.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              Game ID: {game.id} · Lobby{' '}
              <span className="font-medium text-white">
                {game.lobby.code} ({game.lobby.name})
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Created {game.createdAt.toLocaleString('en-US')} · Updated {game.updatedAt.toLocaleString('en-US')}
            </p>
          </div>
          <AdminForceEndGameButton gameId={game.id} status={game.status} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Timing</p>
          <p className="mt-2 text-sm text-slate-200">Last move: {game.lastMoveAt.toLocaleString('en-US')}</p>
          <p className="text-sm text-slate-200">Current turn index: {game.currentTurn}</p>
          <p className="text-sm text-slate-200">
            Abandoned/cancelled marker: {game.abandonedAt ? game.abandonedAt.toLocaleString('en-US') : '-'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">Lobby</p>
          <p className="mt-2 text-sm text-slate-200">Code: {game.lobby.code}</p>
          <p className="text-sm text-slate-200">Name: {game.lobby.name}</p>
          <p className="text-sm text-slate-200">Active: {String(game.lobby.isActive)}</p>
          <p className="text-sm text-slate-200">
            Creator:{' '}
            <Link href={`/admin/users/${game.lobby.creator.id}`} className="text-cyan-300 hover:text-cyan-200">
              {game.lobby.creator.username || game.lobby.creator.email || game.lobby.creator.id}
            </Link>
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Players</h3>
          <Link href="/admin/games" className="text-sm text-cyan-300 hover:text-cyan-200">
            Back to games
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2 pr-3">Player</th>
                <th className="pb-2 pr-3">Position</th>
                <th className="pb-2 pr-3">Score</th>
                <th className="pb-2 pr-3">Ready</th>
                <th className="pb-2">Winner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {game.players.map((player) => (
                <tr key={player.id}>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/users/${player.user.id}`} className="text-white hover:text-cyan-300">
                      {player.user.username || player.user.email || player.user.id}
                    </Link>
                    <div className="text-xs text-slate-400">
                      role {player.user.role} · {player.user.suspended ? 'suspended' : 'active'}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{player.position}</td>
                  <td className="py-2 pr-3 text-slate-300">
                    {player.finalScore ?? player.score}
                    {player.placement ? ` · place ${player.placement}` : ''}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{String(player.isReady)}</td>
                  <td className="py-2 text-slate-300">{player.isWinner ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="mb-3 text-lg font-semibold">Raw State (truncated)</h3>
        <pre className="max-h-[420px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-slate-200">
          {statePreview}
        </pre>
      </section>
    </div>
  )
}
