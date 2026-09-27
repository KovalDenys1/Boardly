import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'

/**
 * The login page's "continue as" chip: the email address of the last account signed in
 * on this device. Storing it is a convenience, not strictly necessary for the sign-in
 * the person asked for, so under ekomloven § 3-15 it needs their active choice (#1133):
 * it is written only when "Remember me" is ticked, and a sign-in with the box unticked
 * removes whatever an earlier one left.
 */
const KEY = 'boardly_last_account'

export interface LastAccount {
  email: string
  name: string | null
  image: string | null
}

export function getLastAccount(): LastAccount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = readLocal(KEY)
    if (!raw) return null
    return JSON.parse(raw) as LastAccount
  } catch {
    return null
  }
}

export function saveLastAccount(data: LastAccount): void {
  writeLocal(KEY, JSON.stringify(data))
}

export function clearLastAccount(): void {
  removeLocal(KEY)
}

/** After a successful sign-in: keep the account only if "Remember me" was ticked. */
export function rememberLastAccount(rememberMe: boolean, data: LastAccount): void {
  if (rememberMe) {
    saveLastAccount(data)
  } else {
    clearLastAccount()
  }
}
