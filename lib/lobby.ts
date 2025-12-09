import { customAlphabet } from 'nanoid'

// Generate 4-character alphanumeric codes
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 4)

export function generateLobbyCode(): string {
  return nanoid()
}
