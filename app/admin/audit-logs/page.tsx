import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

function parseIntParam(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value ? Number(value) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; action?: string; targetType?: string }>
}) {
  await requireAdminSession('/admin/audit-logs')
  const params = await searchParams
  const page = parseIntParam(params.page, 1, 1, 10000)
  const pageSize = parseIntParam(params.pageSize, 25, 1, 100)

  const where = {
    ...(params.action ? { action: { contains: params.action, mode: 'insensitive' as const } } : {}),
    ...(params.targetType ? { targetType: { contains: params.targetType, mode: 'insensitive' as const } } : {}),
  }

  const [total, logs] = await Promise.all([
    prisma.adminAuditLogs.count({ where }),
    prisma.adminAuditLogs.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        details: true,
        createdAt: true,
        admin: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Audit Logs</h2>
            <p className="text-sm text-slate-300">Admin action trail (current coverage: suspend/unsuspend, force-end).</p>
          </div>
          <form className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              name="action"
              defaultValue={params.action || ''}
              placeholder="Action contains..."
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <input
              name="targetType"
              defaultValue={params.targetType || ''}
              placeholder="Target type..."
              className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Filter
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
          <p>{total} log entry(s)</p>
          <p>
            Page {page} / {totalPages}
          </p>
        </div>
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white/10 px-2 py-1 text-xs">{log.action}</span>
                    <span className="rounded bg-white/10 px-2 py-1 text-xs">{log.targetType}</span>
                    {log.targetId ? <span className="text-xs text-slate-400">target: {log.targetId}</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-200">
                    Admin:{' '}
                    <Link href={`/admin/users/${log.admin.id}`} className="text-cyan-300 hover:text-cyan-200">
                      {log.admin.username || log.admin.email || log.admin.id}
                    </Link>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{log.createdAt.toLocaleString('en-US')}</p>
                </div>
              </div>
              {log.details ? (
                <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
              No audit logs found for the selected filters.
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/audit-logs?page=${page - 1}&pageSize=${pageSize}${params.action ? `&action=${encodeURIComponent(params.action)}` : ''}${params.targetType ? `&targetType=${encodeURIComponent(params.targetType)}` : ''}`}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/audit-logs?page=${page + 1}&pageSize=${pageSize}${params.action ? `&action=${encodeURIComponent(params.action)}` : ''}${params.targetType ? `&targetType=${encodeURIComponent(params.targetType)}` : ''}`}
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
