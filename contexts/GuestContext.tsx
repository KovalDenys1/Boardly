'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'

interface GuestContextType {
    isGuest: boolean
    guestId: string | null
    guestName: string | null
    setGuestMode: (name: string) => void
    clearGuestMode: () => void
    getHeaders: () => Record<string, string>
}

const GuestContext = createContext<GuestContextType | undefined>(undefined)

const GUEST_ID_KEY = 'boardly_guest_id'
const GUEST_NAME_KEY = 'boardly_guest_name'

export function GuestProvider({ children }: { children: ReactNode }) {
    const [guestId, setGuestId] = useState<string | null>(null)
    const [guestName, setGuestName] = useState<string | null>(null)

    // Load guest data from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedId = localStorage.getItem(GUEST_ID_KEY)
            const storedName = localStorage.getItem(GUEST_NAME_KEY)

            if (storedId && storedName) {
                setGuestId(storedId)
                setGuestName(storedName)
            }
        }
    }, [])

    const setGuestMode = (name: string) => {
        const newGuestId = `guest-${uuidv4()}`
        setGuestId(newGuestId)
        setGuestName(name)

        if (typeof window !== 'undefined') {
            localStorage.setItem(GUEST_ID_KEY, newGuestId)
            localStorage.setItem(GUEST_NAME_KEY, name)
        }
    }

    const clearGuestMode = () => {
        setGuestId(null)
        setGuestName(null)

        if (typeof window !== 'undefined') {
            localStorage.removeItem(GUEST_ID_KEY)
            localStorage.removeItem(GUEST_NAME_KEY)
        }
    }

    const getHeaders = (): Record<string, string> => {
        if (guestId && guestName) {
            return {
                'X-Guest-Id': guestId,
                'X-Guest-Name': guestName,
            }
        }
        return {}
    }

    const value: GuestContextType = {
        isGuest: Boolean(guestId && guestName),
        guestId,
        guestName,
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
