'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface SetGuestModeOptions {
    guestId?: string
    guestName?: string
    guestToken?: string
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

const GuestContext = createContext<GuestContextType | undefined>(undefined)

const GUEST_ID_KEY = 'boardly_guest_id'
const GUEST_NAME_KEY = 'boardly_guest_name'
const GUEST_TOKEN_KEY = 'boardly_guest_token'

interface GuestSessionResponse {
    guestId: string
    guestName: string
    guestToken: string
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

        if (typeof window !== 'undefined') {
            localStorage.setItem(GUEST_ID_KEY, session.guestId)
            localStorage.setItem(GUEST_NAME_KEY, session.guestName)
            localStorage.setItem(GUEST_TOKEN_KEY, session.guestToken)
        }
    }, [])

    const requestGuestSession = useCallback(async (name: string, token?: string): Promise<GuestSessionResponse> => {
        const response = await fetch('/api/auth/guest-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                guestName: name,
                guestToken: token,
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

        if (typeof window !== 'undefined') {
            localStorage.removeItem(GUEST_ID_KEY)
            localStorage.removeItem(GUEST_NAME_KEY)
            localStorage.removeItem(GUEST_TOKEN_KEY)
        }
    }, [])

    // Load guest data from localStorage on mount
    useEffect(() => {
        if (typeof window === 'undefined') return

        const storedId = localStorage.getItem(GUEST_ID_KEY)
        const storedName = localStorage.getItem(GUEST_NAME_KEY)
        const storedToken = localStorage.getItem(GUEST_TOKEN_KEY)

        if (!storedName) return

        if (storedId && storedToken) {
            setGuestId(storedId)
            setGuestName(storedName)
            setGuestToken(storedToken)

            // Refresh token on startup to recover from expiration seamlessly.
            const generation = guestStateGenerationRef.current
            requestGuestSession(storedName, storedToken)
                .then((session) => applyGuestSession(session, generation))
                .catch(() => {
                    localStorage.removeItem(GUEST_ID_KEY)
                    localStorage.removeItem(GUEST_NAME_KEY)
                    localStorage.removeItem(GUEST_TOKEN_KEY)
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
            .catch(() => {
                localStorage.removeItem(GUEST_ID_KEY)
                localStorage.removeItem(GUEST_NAME_KEY)
                localStorage.removeItem(GUEST_TOKEN_KEY)
            })
    }, [applyGuestSession, requestGuestSession])

    // Never keep guest mode active when authenticated user session exists.
    useEffect(() => {
        if (status !== 'authenticated') {
            lastUpgradeAttemptTokenRef.current = null
            return
        }

        if (typeof window === 'undefined') return

        const storedGuestId = localStorage.getItem(GUEST_ID_KEY)
        const storedGuestName = localStorage.getItem(GUEST_NAME_KEY)
        const storedGuestToken = localStorage.getItem(GUEST_TOKEN_KEY)
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
            (typeof window !== 'undefined' ? localStorage.getItem(GUEST_TOKEN_KEY) || undefined : undefined)

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
