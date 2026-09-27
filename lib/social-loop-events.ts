/**
 * The two social events a user's own topic carries (invite, rematch request),
 * read defensively before they become a toast with a button that navigates.
 *
 * They arrive signed by the server on a topic only that user knows (audit
 * S3-05), so a forged one no longer reaches this code at all. The checks here
 * are the second line: whatever does arrive can only ever send the browser to
 * `/lobby/<code>` with a code of the shape lobby codes have, never to a path
 * built from free text.
 */

export interface SocialToastEvent {
  lobbyCode: string
  lobbyName: string
  actorId: string
  actorName: string
  sequenceId: string | null
}

// Lobby codes are four characters today (lib/lobby.ts); the bound leaves room
// to lengthen them without letting a path segment through.
const LOBBY_CODE_PATTERN = /^[A-Za-z0-9]{4,12}$/
const MAX_NAME_LENGTH = 80

function name(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_NAME_LENGTH) : ''
}

function read(payload: unknown, actorIdKey: string, actorNameKey: string): SocialToastEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>
  if (typeof raw.lobbyCode !== 'string' || !LOBBY_CODE_PATTERN.test(raw.lobbyCode)) return null
  const actorId = raw[actorIdKey]
  return {
    lobbyCode: raw.lobbyCode,
    lobbyName: name(raw.lobbyName),
    actorId: typeof actorId === 'string' ? actorId : '',
    actorName: name(raw[actorNameKey]),
    sequenceId: typeof raw.sequenceId === 'string' && raw.sequenceId.length > 0 ? raw.sequenceId : null,
  }
}

export function readLobbyInviteEvent(payload: unknown): SocialToastEvent | null {
  return read(payload, 'invitedById', 'invitedByName')
}

export function readRematchRequestEvent(payload: unknown): SocialToastEvent | null {
  return read(payload, 'requestedById', 'requestedByName')
}
