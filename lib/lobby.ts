import { customAlphabet } from 'nanoid'

export const LOBBY_CODE_LENGTH = 4
const NUMERIC_LOBBY_CODE_ALPHABET = '0123456789'
const ALPHANUMERIC_LOBBY_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const numericLobbyCodeGenerator = customAlphabet(NUMERIC_LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH)
const alphanumericLobbyCodeGenerator = customAlphabet(ALPHANUMERIC_LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH)

export function generateLobbyCode(options?: { fallbackToAlphanumeric?: boolean }): string {
  if (options?.fallbackToAlphanumeric) {
    return alphanumericLobbyCodeGenerator()
  }

  return numericLobbyCodeGenerator()
}
