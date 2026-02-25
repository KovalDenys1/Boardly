'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function AdminDeleteUserButton({
  userId,
  label = 'Delete user',
  disabled,
  redirectTo = '/admin/users',
}: {
  userId: string
  label?: string
  disabled?: boolean
  redirectTo?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          const confirmed = window.confirm(
            'Delete this user account? This can remove related lobbies/games and cannot be undone.'
          )
          if (!confirmed) return

          startTransition(async () => {
            setError(null)
            try {
              const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
              if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(payload.error || 'Delete user failed')
              }
              if (redirectTo) {
                router.push(redirectTo)
              } else {
                router.refresh()
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Request failed')
            }
          })
        }}
        className="rounded-md bg-red-600/20 px-2.5 py-1 text-xs font-semibold text-red-200 hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Deleting...' : label}
      </button>
      {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
    </div>
  )
}
