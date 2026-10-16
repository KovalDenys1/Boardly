import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'

/**
 * Which in-product surface sent a guest to sign up (#1439).
 *
 * `signupSource` on Users records acquisition (UTM, referrer); this records the surface
 * inside the product, so `guest_upgraded` can say which prompt turned a guest into an
 * account. Kept in localStorage, not sessionStorage, because the email-verification link
 * opens a new tab and a session-scoped mark would never reach the upgrade call.
 */
export const SIGNUP_FROM_VALUES = ['guest_prompt'] as const

export type SignupFrom = (typeof SIGNUP_FROM_VALUES)[number]

const STORAGE_KEY = 'boardly:signup-from'
const TTL_MS = 24 * 60 * 60 * 1000

export function parseSignupFrom(value: unknown): SignupFrom | null {
  return typeof value === 'string' && (SIGNUP_FROM_VALUES as readonly string[]).includes(value)
    ? (value as SignupFrom)
    : null
}

export function markSignupFrom(from: SignupFrom): void {
  writeLocal(STORAGE_KEY, JSON.stringify({ from, at: Date.now() }))
}

/** Reads the mark once and clears it, so a later sign-in on the same browser is not credited to it. */
export function takeSignupFrom(now: number = Date.now()): SignupFrom | null {
  const raw = readLocal(STORAGE_KEY)
  if (!raw) return null
  removeLocal(STORAGE_KEY)
  try {
    const parsed = JSON.parse(raw) as { from?: unknown; at?: unknown }
    if (typeof parsed.at !== 'number' || now - parsed.at > TTL_MS) return null
    return parseSignupFrom(parsed.from)
  } catch {
    return null
  }
}
