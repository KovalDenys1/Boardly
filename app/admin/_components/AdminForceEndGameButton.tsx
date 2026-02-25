'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function AdminForceEndGameButton({
  gameId,
  status,
}: {
  gameId: string
  status: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canForceEnd = status === 'waiting' || status === 'playing' || status === 'abandoned'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!canForceEnd || isPending}
        onClick={() => {
          if (!window.confirm('Force-end this game? This action will mark it as cancelled.')) return

          startTransition(async () => {
            setError(null)
            try {
              const res = await fetch(`/api/admin/games/${gameId}/force-end`, {
                method: 'POST',
              })
              if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(payload.error || 'Force-end failed')
              }
              router.refresh()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Request failed')
            }
          })
        }}
        className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Updating...' : canForceEnd ? 'Force end' : 'Ended'}
      </button>
      {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
    </div>
  )
}
