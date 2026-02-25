import type { ReactNode } from 'react'
import { requireAdminSession } from '@/lib/admin-auth'
import AdminNav from './_components/AdminNav'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminSession('/admin')

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Admin Console</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Platform Management</h1>
              <p className="mt-2 text-sm text-slate-300">
                Internal operations tools (iterative rollout for issue #43).
              </p>
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-sm">
              <p className="text-cyan-200">Signed in as admin</p>
              <p className="font-semibold text-white">{admin.username || admin.email || admin.id}</p>
            </div>
          </div>
        </div>

        <AdminNav />
        {children}
      </div>
    </div>
  )
}
