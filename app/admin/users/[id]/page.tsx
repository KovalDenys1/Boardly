import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminSession } from '@/lib/admin-auth'
import AdminUserSuspendButton from '../../_components/AdminUserSuspendButton'
import AdminDeleteUserButton from '../../_components/AdminDeleteUserButton'
import AdminResetPasswordButton from '../../_components/AdminResetPasswordButton'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession('/admin/users')
  const { id } = await params

  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      image: true,
      role: true,
      suspended: true,
      isGuest: true,
      friendCode: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      lastActiveAt: true,
      _count: {
        select: {
          players: true,
          lobbies: true,
          sentFriendRequests: true,
          receivedFriendRequests: true,
          friendshipsInitiated: true,
          friendshipsReceived: true,
          sentLobbyInvites: true,
          receivedLobbyInvites: true,
        },
      },
      players: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          score: true,
          isWinner: true,
          createdAt: true,
          game: {
            select: {
              id: true,
              status: true,
              gameType: true,
              lobby: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  })

  if (!user) notFound()

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{user.username || user.email || user.id}</h2>
              <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs">{user.role}</span>
              <span
                className={`rounded px-2 py-1 text-xs ${
                  user.suspended ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'
                }`}
              >
                {user.suspended ? 'suspended' : 'active'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{user.email || 'No email'}</p>
            <p className="mt-1 text-xs text-slate-400">
              ID: {user.id} · {user.isGuest ? 'guest' : 'registered'} · friend code: {user.friendCode || '-'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AdminUserSuspendButton userId={user.id} suspended={user.suspended} disabled={user.id === admin.id} />
            {!user.isGuest && !user.suspended ? <AdminResetPasswordButton userId={user.id} /> : null}
            <AdminDeleteUserButton userId={user.id} disabled={user.id === admin.id} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Account</p>
          <p className="mt-2 text-sm text-slate-200">Created: {user.createdAt.toLocaleString('en-US')}</p>
          <p className="text-sm text-slate-200">Updated: {user.updatedAt.toLocaleString('en-US')}</p>
          <p className="text-sm text-slate-200">Last active: {user.lastActiveAt.toLocaleString('en-US')}</p>
          <p className="text-sm text-slate-200">
            Email verified: {user.emailVerified ? user.emailVerified.toLocaleString('en-US') : 'No'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Game activity</p>
          <p className="mt-2 text-sm text-slate-200">Player entries: {user._count.players}</p>
          <p className="text-sm text-slate-200">Created lobbies: {user._count.lobbies}</p>
          <p className="text-sm text-slate-200">Sent invites: {user._count.sentLobbyInvites}</p>
          <p className="text-sm text-slate-200">Received invites: {user._count.receivedLobbyInvites}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Social</p>
          <p className="mt-2 text-sm text-slate-200">Sent friend requests: {user._count.sentFriendRequests}</p>
          <p className="text-sm text-slate-200">Received friend requests: {user._count.receivedFriendRequests}</p>
          <p className="text-sm text-slate-200">
            Friendships: {user._count.friendshipsInitiated + user._count.friendshipsReceived}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Game Participation</h3>
          <Link href="/admin/users" className="text-sm text-cyan-300 hover:text-cyan-200">
            Back to users
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2 pr-3">Game</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Score</th>
                <th className="pb-2">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {user.players.map((player) => (
                <tr key={player.id}>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/games/${player.game.id}`} className="text-white hover:text-cyan-300">
                      {player.game.gameType}
                    </Link>
                    <div className="text-xs text-slate-400">
                      Lobby {player.game.lobby.code} · {player.game.lobby.name}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{player.game.status}</td>
                  <td className="py-2 pr-3 text-slate-300">
                    {player.score} {player.isWinner ? '· winner' : ''}
                  </td>
                  <td className="py-2 text-slate-300">{player.createdAt.toLocaleString('en-US')}</td>
                </tr>
              ))}
              {user.players.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No game participation records found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
