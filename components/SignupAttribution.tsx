'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { takeSignupSourceParam } from '@/lib/signup-source-client'

/**
 * Finishes the OAuth half of acquisition attribution (#1067).
 *
 * Guest and e-mail signups carry the source in a request header, but an OAuth redirect
 * destroys the page, so there the value comes back in the `callbackUrl` query. This reads
 * it, clears it from the address bar and posts it once the session exists. The server only
 * writes it when `signupSource` is still null, so running on an ordinary sign-in is a no-op.
 *
 * Renders nothing.
 */
export function SignupAttribution() {
  const { status } = useSession()
  // Taken on mount rather than on `authenticated`: the value must leave the address bar
  // before the user can copy or share the URL, and the session usually resolves later.
  const pendingRef = useRef<string | null | undefined>(undefined)
  const sentRef = useRef(false)

  if (pendingRef.current === undefined && typeof window !== 'undefined') {
    pendingRef.current = takeSignupSourceParam()
  }

  useEffect(() => {
    const source = pendingRef.current
    if (!source || sentRef.current || status !== 'authenticated') return

    sentRef.current = true
    void fetch('/api/auth/attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
      keepalive: true,
    }).catch(() => {
      // Attribution is best-effort and must never surface to the player.
    })
  }, [status])

  return null
}
