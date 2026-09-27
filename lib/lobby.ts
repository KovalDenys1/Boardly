import { customAlphabet } from 'nanoid'

export const LOBBY_CODE_LENGTH = 4
const NUMERIC_LOBBY_CODE_ALPHABET = '0123456789'
const ALPHANUMERIC_LOBBY_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const numericLobbyCodeGenerator = customAlphabet(NUMERIC_LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH)
const alphanumericLobbyCodeGenerator = customAlphabet(ALPHANUMERIC_LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH)

/**
 * What a lobby's code becomes when the retention rule retires it (#1130): the prefix and
 * the lobby's own id. Unique because the id is, and never mistaken for a live code: the
 * generator below only ever makes four characters from [0-9A-Z], so a code starting with
 * `~` can never collide with one it hands out, and the four-digit code goes back into the
 * pool.
 */
export const RETIRED_LOBBY_CODE_PREFIX = '~'

export function isRetiredLobbyCode(code: string): boolean {
  return code.startsWith(RETIRED_LOBBY_CODE_PREFIX)
}

export function generateLobbyCode(options?: { fallbackToAlphanumeric?: boolean }): string {
  if (options?.fallbackToAlphanumeric) {
    return alphanumericLobbyCodeGenerator()
  }

  return numericLobbyCodeGenerator()
}

/**
 * True if a Prisma error is a unique-constraint collision on the lobby
 * code column (safe to retry with a freshly generated code). Prisma 7 can
 * omit meta.target on P2002 errors, so this falls back to the error message
 * and finally to treating any P2002 on a lobby create as a code collision —
 * a bare `meta.target` string check alone silently stops retrying on Prisma
 * 7 and lets the error throw unhandled instead.
 */
export function isLobbyCodeConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const prismaCode = (error as { code?: unknown }).code
  if (prismaCode !== 'P2002') return false

  const target = (error as { meta?: { target?: unknown } }).meta?.target
  if (Array.isArray(target)) {
    return target.some((entry) => String(entry).toLowerCase().includes('code'))
  }

  if (typeof target === 'string') {
    return target.toLowerCase().includes('code')
  }

  const message = (error as { message?: unknown }).message
  if (typeof message === 'string') {
    const msg = message.toLowerCase()
    return msg.includes('unique constraint') && msg.includes('code')
  }

  return true // P2002 on lobbies.create must be a code collision
}
