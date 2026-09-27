import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'

/**
 * The login page's "continue as" chip: the email address of the last account signed in
 * on this device. Storing it is a convenience, not strictly necessary for the sign-in
 * the person asked for, so under ekomloven § 3-15 it needs their active choice (#1133):
 * it is written only when "Remember me" is ticked, and a sign-in with the box unticked
 * removes whatever an earlier one left.
 *
 * Every entry written since then carries `rememberMe: true`. An entry without it was
 * written before the rule, on every email sign-in whatever the box said, so it is not
 * the person's choice: pruneUnrememberedLastAccount() removes it on app start and
 * getLastAccount() never returns it.
 */
const KEY = 'boardly_last_account'

export interface LastAccount {
  email: string
  name: string | null
  image: string | null
}

type StoredLastAccount = LastAccount & { rememberMe: true }

function readStored(): StoredLastAccount | null {
  const raw = readLocal(KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { rememberMe?: unknown }).rememberMe === true &&
      typeof (parsed as { email?: unknown }).email === 'string'
    ) {
      return parsed as StoredLastAccount
    }
  } catch {
    // Malformed: treated like an entry without the marker.
  }
  return null
}

export function getLastAccount(): LastAccount | null {
  if (typeof window === 'undefined') return null
  const stored = readStored()
  if (!stored) {
    pruneUnrememberedLastAccount()
    return null
  }
  return { email: stored.email, name: stored.name ?? null, image: stored.image ?? null }
}

/** Writes the entry with the marker that says "Remember me" was ticked. */
export function saveLastAccount(data: LastAccount): void {
  const stored: StoredLastAccount = { ...data, rememberMe: true }
  writeLocal(KEY, JSON.stringify(stored))
}

export function clearLastAccount(): void {
  removeLocal(KEY)
}

/** Removes an entry that lacks the marker (written before #1133, or unreadable). */
export function pruneUnrememberedLastAccount(): void {
  if (typeof window === 'undefined') return
  if (readLocal(KEY) !== null && !readStored()) clearLastAccount()
}

/** After a successful sign-in: keep the account only if "Remember me" was ticked. */
export function rememberLastAccount(rememberMe: boolean, data: LastAccount): void {
  if (rememberMe) {
    saveLastAccount(data)
  } else {
    clearLastAccount()
  }
}
