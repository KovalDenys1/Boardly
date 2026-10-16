import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'

export const SIGNUP_FROM_VALUES = ['guest_prompt'] as const

export type SignupFrom = (typeof SIGNUP_FROM_VALUES)[number]

// localStorage, not sessionStorage: the email-verification link opens a new tab.
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

export function peekSignupFrom(now: number = Date.now()): SignupFrom | null {
  const raw = readLocal(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { from?: unknown; at?: unknown }
    if (typeof parsed.at !== 'number' || now - parsed.at > TTL_MS) return null
    return parseSignupFrom(parsed.from)
  } catch {
    return null
  }
}

export function clearSignupFrom(): void {
  removeLocal(STORAGE_KEY)
}
