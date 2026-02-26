'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function AdminUserSuspendButton({
  userId,
  suspended,
  disabled,
}: {
  userId: string
  suspended: boolean
  disabled?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          const nextSuspended = !suspended
          const confirmed = window.confirm(
            nextSuspended ? 'Suspend this user account?' : 'Unsuspend this user account?'
          )
          if (!confirmed) return

          startTransition(async () => {
            setError(null)
            try {
              const res = await fetch(`/api/admin/users/${userId}/suspend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suspended: nextSuspended }),
              })
              if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(payload.error || 'Admin user update failed')
              }
              router.refresh()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Request failed')
            }
          })
        }}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
          suspended
            ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
            : 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isPending ? 'Saving...' : suspended ? 'Unsuspend' : 'Suspend'}
      </button>
      {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
    </div>
  )
}
