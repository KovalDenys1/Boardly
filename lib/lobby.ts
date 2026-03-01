import { customAlphabet } from 'nanoid'

export const LOBBY_CODE_LENGTH = 6
const LOBBY_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// Generate stronger uppercase alphanumeric lobby codes.
const nanoid = customAlphabet(LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH)

export function generateLobbyCode(): string {
  return nanoid()
}
