'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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
    const [guestId, setGuestId] = useState<string | null>(null)
    const [guestName, setGuestName] = useState<string | null>(null)
    const [guestToken, setGuestToken] = useState<string | null>(null)

    const applyGuestSession = (session: GuestSessionResponse) => {
        setGuestId(session.guestId)
        setGuestName(session.guestName)
        setGuestToken(session.guestToken)

        if (typeof window !== 'undefined') {
            localStorage.setItem(GUEST_ID_KEY, session.guestId)
            localStorage.setItem(GUEST_NAME_KEY, session.guestName)
            localStorage.setItem(GUEST_TOKEN_KEY, session.guestToken)
        }
    }

    const requestGuestSession = async (name: string, token?: string): Promise<GuestSessionResponse> => {
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
            throw new Error(data?.error || 'Failed to initialize guest session')
        }

        return data as GuestSessionResponse
    }

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
            requestGuestSession(storedName, storedToken)
                .then(applyGuestSession)
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
        requestGuestSession(storedName)
            .then(applyGuestSession)
            .catch(() => {
                localStorage.removeItem(GUEST_ID_KEY)
                localStorage.removeItem(GUEST_NAME_KEY)
                localStorage.removeItem(GUEST_TOKEN_KEY)
            })
    }, [])

    const setGuestMode = async (name: string, options?: SetGuestModeOptions) => {
        const normalizedName = name.trim()
        if (normalizedName.length < 2) {
            throw new Error('Guest name must be at least 2 characters')
        }

        if (options?.guestId && options?.guestToken) {
            applyGuestSession({
                guestId: options.guestId,
                guestName: options.guestName || normalizedName,
                guestToken: options.guestToken,
            })
            return
        }

        const activeToken =
            options?.guestToken ||
            guestToken ||
            (typeof window !== 'undefined' ? localStorage.getItem(GUEST_TOKEN_KEY) || undefined : undefined)

        const session = await requestGuestSession(normalizedName, activeToken)
        applyGuestSession(session)
    }

    const clearGuestMode = () => {
        setGuestId(null)
        setGuestName(null)
        setGuestToken(null)

        if (typeof window !== 'undefined') {
            localStorage.removeItem(GUEST_ID_KEY)
            localStorage.removeItem(GUEST_NAME_KEY)
            localStorage.removeItem(GUEST_TOKEN_KEY)
        }
    }

    const getHeaders = (): Record<string, string> => {
        if (guestToken) {
            return {
                'X-Guest-Token': guestToken,
            }
        }
        return {}
    }

    const value: GuestContextType = {
        isGuest: Boolean(guestId && guestName && guestToken),
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
