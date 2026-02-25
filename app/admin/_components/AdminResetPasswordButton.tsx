'use client'

import { useState, useTransition } from 'react'

export default function AdminResetPasswordButton({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm('Generate password reset for this user?')) return
          startTransition(async () => {
            setError(null)
            setStatus(null)
            try {
              const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' })
              const payload = (await res.json().catch(() => ({}))) as {
                error?: string
                emailSent?: boolean
                resetUrl?: string
              }
              if (!res.ok) {
                throw new Error(payload.error || 'Reset password failed')
              }

              if (payload.resetUrl) {
                try {
                  await navigator.clipboard.writeText(payload.resetUrl)
                  setStatus(payload.emailSent ? 'Reset sent (link copied)' : 'Reset link created and copied')
                } catch {
                  setStatus(payload.emailSent ? `Reset sent: ${payload.resetUrl}` : `Reset link: ${payload.resetUrl}`)
                }
              } else {
                setStatus('Password reset created')
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Request failed')
            }
          })
        }}
        className="rounded-md bg-blue-600/20 px-2.5 py-1 text-xs font-semibold text-blue-200 hover:bg-blue-600/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Generating...' : 'Reset password'}
      </button>
      {status ? <p className="text-[10px] text-blue-200">{status}</p> : null}
      {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
    </div>
  )
}
