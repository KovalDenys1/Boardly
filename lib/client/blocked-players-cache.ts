import { getSafeLocalStorage, readLocal, writeLocal } from '@/lib/safe-storage'
import { BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX } from '@/lib/user-blocks'

// Who the session says is signed in: undefined until something reports it, null when signed out.
let signedInAs: string | null | undefined

/** The device's copy of an account's block list (#1466), as stored; null when there is none. */
export function readAccountBlockCache(accountId: string): string | null {
  return readLocal(BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX + accountId)
}

/** Whether a write for this account may still land: an answer that arrives after sign-out must not bring the copy back. */
export function isCurrentBlockCacheAccount(accountId: string): boolean {
  return signedInAs === undefined || signedInAs === accountId
}

export function writeAccountBlockCache(accountId: string, value: string): void {
  if (isCurrentBlockCacheAccount(accountId)) writeLocal(BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX + accountId, value)
}

/**
 * Records who is signed in and removes every other account's copy, all of them when nobody is:
 * the privacy notice promises that signing out removes it, from whichever page that happens on.
 */
export function syncAccountBlockCache(accountId: string | null): void {
  signedInAs = accountId
  const storage = getSafeLocalStorage()
  if (!storage) return
  try {
    const stale: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index)
      if (name?.startsWith(BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX) && name !== BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX + accountId) {
        stale.push(name)
      }
    }
    for (const name of stale) storage.removeItem(name)
  } catch {
    // Storage is best-effort; the next session change tries again.
  }
}
