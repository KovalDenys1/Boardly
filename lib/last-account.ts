const KEY = 'boardly_last_account'

export interface LastAccount {
  email: string
  name: string | null
  image: string | null
}

export function getLastAccount(): LastAccount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as LastAccount
  } catch {
    return null
  }
}

export function saveLastAccount(data: LastAccount): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(data))
}
