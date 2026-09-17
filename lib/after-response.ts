import { after } from 'next/server'

/**
 * Keep background work alive past the response (#985).
 *
 * `after()` hands the promise to the platform so the serverless instance is not
 * frozen the moment the response is sent — which is what cut the bot-turn
 * trigger off mid-flight and left the bot waiting for a client-side watchdog.
 *
 * It only works inside a request scope. Unit tests call route handlers directly,
 * with no such scope, and `after()` throws there; falling back to a detached
 * promise keeps those callers working while production gets the real guarantee.
 */
export function runAfterResponse(work: Promise<unknown>): void {
  try {
    after(work)
  } catch {
    void work
  }
}
