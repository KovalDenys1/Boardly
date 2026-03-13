import Link from 'next/link'
import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { requireAdminSession } from '@/lib/admin-auth'
import AdminForceEndGameButton from '../_components/AdminForceEndGameButton'
import AdminDeleteGameButton from '../_components/AdminDeleteGameButton'

export const dynamic = 'force-dynamic'

function parseIntParam(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value ? Number(value) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

type AllowedStatus = 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled'

export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string; status?: string }>
}) {
  await requireAdminSession('/admin/games')
  const params = await searchParams
  const q = (params.q || '').trim()
  const page = parseIntParam(params.page, 1, 1, 10000)
  const pageSize = parseIntParam(params.pageSize, 20, 1, 100)
  const status =
    params.status && ['waiting', 'playing', 'finished', 'abandoned', 'cancelled'].includes(params.status)
      ? (params.status as AllowedStatus)
      : undefined

  const where: Prisma.GamesWhereInput = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { lobby: { code: { contains: q, mode: 'insensitive' } } },
            { lobby: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [total, games] = await Promise.all([
    prisma.games.count({ where }),
    prisma.games.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        gameType: true,
        createdAt: true,
        updatedAt: true,
        abandonedAt: true,
        lastMoveAt: true,
        lobby: {
          select: { id: true, code: true, name: true, isActive: true },
        },
        _count: { select: { players: true } },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Games</h2>
            <p className="text-sm text-slate-300">Inspect active/completed games and force-end stuck sessions.</p>
          </div>
          <form className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search game id / lobby code / lobby name"
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <select
              name="status"
              defaultValue={status || ''}
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
            >
              <option value="">All statuses</option>
              <option value="waiting">waiting</option>
              <option value="playing">playing</option>
              <option value="finished">finished</option>
              <option value="abandoned">abandoned</option>
              <option value="cancelled">cancelled</option>
            </select>
            <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Filter
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
          <p>{total} game(s)</p>
          <p>
            Page {page} / {totalPages}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2 pr-3">Game</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Players</th>
                <th className="pb-2 pr-3">Last move</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {games.map((game) => (
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
                  <td className="py-2 pr-3 text-slate-300">{game.lastMoveAt.toLocaleString('en-US')}</td>
                  <td className="py-2">
                    <div className="flex flex-col items-end gap-2">
                      <AdminForceEndGameButton gameId={game.id} status={game.status} />
                      <AdminDeleteGameButton gameId={game.id} redirectTo="" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/games?page=${page - 1}&pageSize=${pageSize}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/games?page=${page + 1}&pageSize=${pageSize}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            >
              Next
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  )
}
