import { useRef, useCallback } from 'react'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'

const LEAVE_REQUEST_TIMEOUT_MS = 2500

export type LeaveApiOutcome = 'pending' | 'ok' | 'non_ok' | 'timeout' | 'error'

export interface LeaveApiSettleResult {
    outcome: LeaveApiOutcome
    statusCode: number | null
    payload: unknown
}

/**
 * Shared "safely call POST /api/lobby/{code}/leave" mechanics: keepalive
 * fetch, an abort-timeout so a hung request can't block the leave flow, and
 * outcome-tracking refs a caller's own navigateAfterLeave/analytics code can
 * read. This used to be hand-rolled near-identically in LobbyPageClient,
 * the Tic-Tac-Toe page, and the Connect Four page — and independently
 * reimplemented in the Alias page without the timeout/abort/outcome-tracking
 * safety net at all. Navigation, toast copy, and analytics payloads stay
 * caller-owned since those genuinely differ per page.
 */
export function useLeaveLobby(code: string, logLabel: string) {
    const isLeavingLobbyRef = useRef(false)
    const leaveStartedAtRef = useRef<number | null>(null)
    const leaveApiOutcomeRef = useRef<LeaveApiOutcome>('pending')
    const leaveApiStatusCodeRef = useRef<number | null>(null)

    const leaveLobby = useCallback(
        (onSettled?: (result: LeaveApiSettleResult) => void) => {
            if (isLeavingLobbyRef.current) return
            isLeavingLobbyRef.current = true
            leaveStartedAtRef.current = Date.now()
            leaveApiOutcomeRef.current = 'pending'
            leaveApiStatusCodeRef.current = null

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), LEAVE_REQUEST_TIMEOUT_MS)

            void fetchWithGuest(`/api/lobby/${code}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                signal: controller.signal,
            })
                .then(async (response) => {
                    clearTimeout(timeoutId)
                    leaveApiStatusCodeRef.current = response.status
                    const payload = await response.json().catch(() => null)

                    if (!response.ok) {
                        leaveApiOutcomeRef.current = 'non_ok'
                        clientLogger.warn(`${logLabel} leave API returned non-ok status`, {
                            code,
                            status: response.status,
                            payload,
                        })
                    } else {
                        leaveApiOutcomeRef.current = 'ok'
                    }
                    onSettled?.({ outcome: leaveApiOutcomeRef.current, statusCode: response.status, payload })
                })
                .catch((error) => {
                    clearTimeout(timeoutId)
                    if ((error as Error)?.name === 'AbortError') {
                        leaveApiOutcomeRef.current = 'timeout'
                        clientLogger.warn(`${logLabel} leave API timed out`, { code, timeoutMs: LEAVE_REQUEST_TIMEOUT_MS })
                    } else {
                        leaveApiOutcomeRef.current = 'error'
                        clientLogger.warn(`${logLabel} leave API failed`, { code, error })
                    }
                    onSettled?.({ outcome: leaveApiOutcomeRef.current, statusCode: leaveApiStatusCodeRef.current, payload: null })
                })
        },
        [code, logLabel]
    )

    return { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby }
}
