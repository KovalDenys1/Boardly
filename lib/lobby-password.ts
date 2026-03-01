import { comparePassword, hashPassword } from '@/lib/auth'

const BCRYPT_HASH_PREFIX = /^\$2[aby]\$\d{2}\$/

function normalizeLobbyPassword(password: string | null | undefined): string | null {
  if (typeof password !== 'string') {
    return null
  }

  const normalized = password.trim()
  return normalized.length > 0 ? normalized : null
}

export function isHashedLobbyPassword(password: string | null | undefined): boolean {
  if (!password) return false
  return BCRYPT_HASH_PREFIX.test(password)
}

export async function hashLobbyPassword(password: string | null | undefined): Promise<string | null> {
  const normalized = normalizeLobbyPassword(password)
  if (!normalized) {
    return null
  }

  return hashPassword(normalized)
}

export async function verifyLobbyPassword(
  storedPassword: string | null | undefined,
  providedPassword: string | null | undefined
): Promise<boolean> {
  const normalizedStored = normalizeLobbyPassword(storedPassword)
  if (!normalizedStored) {
    return true
  }

  const normalizedProvided = normalizeLobbyPassword(providedPassword)
  if (!normalizedProvided) {
    return false
  }

  if (isHashedLobbyPassword(normalizedStored)) {
    try {
      return await comparePassword(normalizedProvided, normalizedStored)
    } catch {
      return false
    }
  }

  // Legacy fallback for old lobbies that still store plain-text passwords.
  return normalizedStored === normalizedProvided
}
