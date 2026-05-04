import type { ReactNode } from 'react'
import { requireAdminSession } from '@/lib/admin-auth'
import AdminNav from './_components/AdminNav'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminSession('/admin')

  return (
    <div className="min-h-[100dvh] px-4 py-8 sm:px-6 lg:px-8" style={{ background: 'var(--bd-ink)', color: '#FBF6EE' }}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-2xl p-6 shadow-xl" style={{ background: '#2A2420', border: '1.5px solid #3A3028' }}>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--bd-sun)', opacity: 0.8 }}>Admin Console</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl" style={{ color: '#FBF6EE' }}>Platform Management</h1>
              <p className="mt-2 text-sm" style={{ color: '#BFB5A8' }}>
                Internal operations tools.
              </p>
            </div>
            <div className="rounded-xl px-4 py-3 text-sm" style={{ border: '1.5px solid #FFC44D40', background: '#FFC44D10' }}>
              <p style={{ color: '#FFC44DAA' }}>Signed in as admin</p>
              <p className="font-semibold" style={{ color: 'var(--bd-sun)' }}>{admin.username || admin.email || admin.id}</p>
            </div>
          </div>
        </div>

        <AdminNav />
        {children}
      </div>
    </div>
  )
}
