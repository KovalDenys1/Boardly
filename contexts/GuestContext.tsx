'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'
import { signupSourceHeaders } from '@/lib/signup-source-client'

interface SetGuestModeOptions {
    guestId?: string
    guestName?: string
    guestToken?: string
    guestIdentityToken?: string
}

interface GuestContextType {
    isGuest: boolean
    guestId: string | null
    guestName: string | null
    guestToken: string | null
    setGuestMode: (name: string, options?: SetGuestModeOptions) => Promise<void>
    clearGuestMode: () => void
    getHeaders: () => Record<string, string>
}

/**
 * Whether a failed session refresh means the stored identity is worthless.
 *
 * The refresh on page load exists to recover from token expiry — and expiry
 * does not reach here, because the route mints a fresh guest and answers 200.
 * What reaches here is a 400 or 409 (the stored name cannot be used), or a 429,
 * a 5xx, or a dropped connection — none of which say anything about the
 * identity in localStorage.
 *
 * Discarding it on those threw the player out of their game for a reason that
 * had nothing to do with them: /api/auth/guest-session allows five requests per
 * fifteen minutes **per IP**, and everyone behind one NAT — a school, an
 * office, a mobile carrier — shares that address (#856). The token is good for
 * 12h, so keeping it and trying again on the next load is strictly better.
 */
function refreshFailureInvalidatesIdentity(error: unknown): boolean {
    const status = (error as { statusCode?: number } | null)?.statusCode
    return status === 400 || status === 409
}

const GuestContext = createContext<GuestContextType | undefined>(undefined)

const GUEST_ID_KEY = 'boardly_guest_id'
const GUEST_NAME_KEY = 'boardly_guest_name'
const GUEST_TOKEN_KEY = 'boardly_guest_token'
// Outlives the 12h session token so a guest returning the next day is the same
// person rather than a brand new one (#818). Identity only — it authorises
// nothing on its own.
const GUEST_IDENTITY_KEY = 'boardly_guest_identity'

interface GuestSessionResponse {
    guestId: string
    guestName: string
    guestToken: string
    guestIdentityToken?: string
}

export function GuestProvider({ children }: { children: ReactNode }) {
    const { status } = useSession()
    const [guestId, setGuestId] = useState<string | null>(null)
    const [guestName, setGuestName] = useState<string | null>(null)
    const [guestToken, setGuestToken] = useState<string | null>(null)
    const guestStateGenerationRef = useRef(0)
    const lastUpgradeAttemptTokenRef = useRef<string | null>(null)

    const applyGuestSession = useCallback((session: GuestSessionResponse, generation = guestStateGenerationRef.current) => {
        // Ignore stale async results from previous guest sessions.
        if (generation !== guestStateGenerationRef.current) {
            return
        }

        setGuestId(session.guestId)
        setGuestName(session.guestName)
        setGuestToken(session.guestToken)

        writeLocal(GUEST_ID_KEY, session.guestId)
        writeLocal(GUEST_NAME_KEY, session.guestName)
        writeLocal(GUEST_TOKEN_KEY, session.guestToken)
        if (session.guestIdentityToken) {
            writeLocal(GUEST_IDENTITY_KEY, session.guestIdentityToken)
        }
    }, [])

    const requestGuestSession = useCallback(async (name: string, token?: string): Promise<GuestSessionResponse> => {
        const response = await fetch('/api/auth/guest-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...signupSourceHeaders(),
            },
            body: JSON.stringify({
                guestName: name,
                guestToken: token,
                // Sent so an expired session token can still resolve back to
                // the same guest instead of minting a new one (#818).
                guestIdentityToken: readLocal(GUEST_IDENTITY_KEY) || undefined,
            }),
        })

        const data = await response.json()
        if (!response.ok) {
            // Create error with translationKey if available
            const error = new Error(data?.error || 'Failed to initialize guest session') as Error & { translationKey?: string; statusCode?: number }
            error.translationKey = data?.translationKey
            error.statusCode = response.status
            throw error
        }

        return data as GuestSessionResponse
    }, [])

    const clearGuestMode = useCallback(() => {
        // Invalidate any in-flight guest refresh requests.
        guestStateGenerationRef.current += 1

        setGuestId(null)
        setGuestName(null)
        setGuestToken(null)

        removeLocal(GUEST_ID_KEY)
        removeLocal(GUEST_NAME_KEY)
        removeLocal(GUEST_TOKEN_KEY)
    }, [])

    // Load guest data from localStorage on mount
    useEffect(() => {
        const storedId = readLocal(GUEST_ID_KEY)
        const storedName = readLocal(GUEST_NAME_KEY)
        const storedToken = readLocal(GUEST_TOKEN_KEY)

        if (!storedName) return

        if (storedId && storedToken) {
            setGuestId(storedId)
            setGuestName(storedName)
            setGuestToken(storedToken)

            // Refresh token on startup to recover from expiration seamlessly.
            const generation = guestStateGenerationRef.current
            requestGuestSession(storedName, storedToken)
                .then((session) => applyGuestSession(session, generation))
                .catch((error) => {
                    if (!refreshFailureInvalidatesIdentity(error)) return
                    removeLocal(GUEST_ID_KEY)
                    removeLocal(GUEST_NAME_KEY)
                    removeLocal(GUEST_TOKEN_KEY)
                    setGuestId(null)
                    setGuestName(null)
                    setGuestToken(null)
                })
            return
        }

        // Migrate legacy guest sessions without token to signed token flow.
        const generation = guestStateGenerationRef.current
        requestGuestSession(storedName)
            .then((session) => applyGuestSession(session, generation))
            .catch((error) => {
                if (!refreshFailureInvalidatesIdentity(error)) return
                removeLocal(GUEST_ID_KEY)
                removeLocal(GUEST_NAME_KEY)
                removeLocal(GUEST_TOKEN_KEY)
            })
    }, [applyGuestSession, requestGuestSession])

    // Never keep guest mode active when authenticated user session exists.
    useEffect(() => {
        if (status !== 'authenticated') {
            lastUpgradeAttemptTokenRef.current = null
            return
        }

        const storedGuestId = readLocal(GUEST_ID_KEY)
        const storedGuestName = readLocal(GUEST_NAME_KEY)
        const storedGuestToken = readLocal(GUEST_TOKEN_KEY)
        const activeGuestToken = guestToken || storedGuestToken
        const hasStoredGuest =
            Boolean(storedGuestId) ||
            Boolean(storedGuestName) ||
            Boolean(storedGuestToken) ||
            Boolean(guestId) ||
            Boolean(guestName) ||
            Boolean(guestToken)

        if (!activeGuestToken) {
            if (hasStoredGuest) {
                clearGuestMode()
            }
            return
        }

        if (lastUpgradeAttemptTokenRef.current === activeGuestToken) {
            return
        }

        lastUpgradeAttemptTokenRef.current = activeGuestToken
        let cancelled = false

        ;(async () => {
            try {
                await fetch('/api/user/upgrade-guest', {
                    method: 'POST',
                    headers: {
                        'X-Guest-Token': activeGuestToken,
                    },
                })
            } catch {
                // Ignore migration failures in client state transition path.
                // The backend migration is idempotent and can be retried safely.
            } finally {
                if (!cancelled) {
                    clearGuestMode()
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [status, guestId, guestName, guestToken, clearGuestMode])

    const setGuestMode = useCallback(async (name: string, options?: SetGuestModeOptions) => {
        const normalizedName = name.trim()
        if (normalizedName.length < 2) {
            throw new Error('Guest name must be at least 2 characters')
        }

        const generation = guestStateGenerationRef.current

        if (options?.guestId && options?.guestToken) {
            applyGuestSession({
                guestId: options.guestId,
                guestName: options.guestName || normalizedName,
                guestToken: options.guestToken,
            }, generation)
            return
        }

        const activeToken =
            options?.guestToken ||
            guestToken ||
            (readLocal(GUEST_TOKEN_KEY) || undefined)

        const session = await requestGuestSession(normalizedName, activeToken)
        applyGuestSession(session, generation)
    }, [guestToken, requestGuestSession, applyGuestSession])

    const getHeaders = (): Record<string, string> => {
        if (status === 'authenticated') {
            return {}
        }

        if (guestToken) {
            return {
                'X-Guest-Token': guestToken,
            }
        }
        return {}
    }

    const value: GuestContextType = {
        isGuest: status !== 'authenticated' && Boolean(guestId && guestName && guestToken),
        guestId,
        guestName,
        guestToken,
        setGuestMode,
        clearGuestMode,
        getHeaders,
    }

    return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>
}

export function useGuest() {
    const context = useContext(GuestContext)
    if (context === undefined) {
        throw new Error('useGuest must be used within a GuestProvider')
    }
    return context
}
