import type { TranslationKeys } from './i18n-helpers'

/**
 * Why a join was refused, as a code rather than as prose.
 *
 * The join endpoints keep sending their English `error` sentence — it is what
 * the server logs and what a client loaded before this change still matches on
 * — but the code is what the visitor's own language is chosen by (#967). A
 * Russian, Norwegian or Ukrainian player following an invite link used to read
 * "Lobby is full" at the exact moment the product asked them to commit.
 */
export const LOBBY_JOIN_REFUSAL_CODES = ['LOBBY_FULL', 'GAME_IN_PROGRESS'] as const

export type LobbyJoinRefusalCode = (typeof LOBBY_JOIN_REFUSAL_CODES)[number]

const REFUSAL_MESSAGE_KEYS: Record<LobbyJoinRefusalCode, TranslationKeys> = {
  LOBBY_FULL: 'lobby.joinSection.lobbyFull',
  GAME_IN_PROGRESS: 'lobby.joinSection.gameInProgress',
}

export function isLobbyJoinRefusalCode(value: unknown): value is LobbyJoinRefusalCode {
  return (
    typeof value === 'string' &&
    (LOBBY_JOIN_REFUSAL_CODES as readonly string[]).includes(value)
  )
}

/** The translation key for a refusal, or null for anything else the API returns. */
export function getLobbyJoinRefusalMessageKey(value: unknown): TranslationKeys | null {
  return isLobbyJoinRefusalCode(value) ? REFUSAL_MESSAGE_KEYS[value] : null
}
