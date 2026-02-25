import Link from 'next/link'
import type { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAdminSession } from '@/lib/admin-auth'
import AdminUserSuspendButton from '../_components/AdminUserSuspendButton'

export const dynamic = 'force-dynamic'

function parseIntParam(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value ? Number(value) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string; role?: string; suspended?: string }>
}) {
  const admin = await requireAdminSession('/admin/users')
  const params = await searchParams
  const q = (params.q || '').trim()
  const page = parseIntParam(params.page, 1, 1, 10000)
  const pageSize = parseIntParam(params.pageSize, 20, 1, 100)
  const roleParam = params.role === 'user' || params.role === 'admin' ? params.role : undefined
  const roleFilter: UserRole | undefined = roleParam

  const where: Prisma.UsersWhereInput = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { id: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(params.suspended === 'true' ? { suspended: true } : {}),
    ...(params.suspended === 'false' ? { suspended: false } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
  }

  const [total, users] = await Promise.all([
    prisma.users.count({ where }),
    prisma.users.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        suspended: true,
        isGuest: true,
        createdAt: true,
        lastActiveAt: true,
        _count: { select: { players: true, lobbies: true } },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Users</h2>
            <p className="text-sm text-slate-300">Search, inspect and suspend accounts.</p>
          </div>
          <form className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search email / username / id"
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <select
              name="role"
              defaultValue={roleParam || ''}
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
            >
              <option value="">All roles</option>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <select
              name="suspended"
              defaultValue={params.suspended || ''}
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
            >
              <option value="">All statuses</option>
              <option value="false">active</option>
              <option value="true">suspended</option>
            </select>
            <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Filter
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
          <p>{total} user(s)</p>
          <p>
            Page {page} / {totalPages}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2 pr-3">User</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Stats</th>
                <th className="pb-2 pr-3">Last active</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
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
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs">
                      {user.role}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        user.suspended ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'
                      }`}
                    >
                      {user.suspended ? 'suspended' : 'active'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    games {user._count.players} · lobbies {user._count.lobbies}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{user.lastActiveAt.toLocaleString('en-US')}</td>
                  <td className="py-2">
                    <AdminUserSuspendButton
                      userId={user.id}
                      suspended={user.suspended}
                      disabled={user.id === admin.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/users?page=${page - 1}&pageSize=${pageSize}&q=${encodeURIComponent(q)}${roleParam ? `&role=${roleParam}` : ''}${params.suspended ? `&suspended=${params.suspended}` : ''}`}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/users?page=${page + 1}&pageSize=${pageSize}&q=${encodeURIComponent(q)}${roleParam ? `&role=${roleParam}` : ''}${params.suspended ? `&suspended=${params.suspended}` : ''}`}
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
