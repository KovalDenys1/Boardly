/**
 * Fetch utility that automatically adds guest headers when user is in guest mode
 * Use this instead of native fetch for all API calls
 */

/**
 * Get guest headers from localStorage
 * Returns empty object if not in guest mode
 */
export function getGuestHeaders(): HeadersInit {
    if (typeof window === 'undefined') {
        return {}
    }

    const guestId = localStorage.getItem('boardly_guest_id')
    const guestName = localStorage.getItem('boardly_guest_name')

    if (guestId && guestName) {
        return {
            'X-Guest-Id': guestId,
            'X-Guest-Name': guestName,
        }
    }

    return {}
}

/**
 * Fetch wrapper that automatically includes guest headers
 * Usage: fetchWithGuest('/api/lobby', { method: 'POST', body: JSON.stringify(data) })
 */
export async function fetchWithGuest(
    input: RequestInfo | URL,
    init?: RequestInit
): Promise<Response> {
    const guestHeaders = getGuestHeaders()

    const headers = new Headers(init?.headers)
    Object.entries(guestHeaders).forEach(([key, value]) => {
        headers.set(key, value)
    })

    return fetch(input, {
        ...init,
        headers,
    })
}

/**
 * Check if user is currently in guest mode
 */
export function isGuestMode(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    const guestId = localStorage.getItem('boardly_guest_id')
    const guestName = localStorage.getItem('boardly_guest_name')

    return Boolean(guestId && guestName)
}

/**
 * Get current guest data
 */
export function getGuestData(): { guestId: string; guestName: string } | null {
    if (typeof window === 'undefined') {
        return null
    }

    const guestId = localStorage.getItem('boardly_guest_id')
    const guestName = localStorage.getItem('boardly_guest_name')

    if (guestId && guestName) {
        return { guestId, guestName }
    }

    return null
}
