/**
 * The spectate page's presence-and-chat topic (audit S3-07, GHSA-g868-9224-wr3p).
 *
 * It was `spectators:{code}`, so anyone could join it for any four-digit code,
 * post into a lobby's spectator chat and inflate its viewer count. It now
 * carries the lobby secret, which only the spectate route hands out, and what
 * arrives on it is still a peer's claim, so it is checked.
 */

import { buildLobbyTopic, buildSpectatorTopic, spectatorTopicFor } from '@/lib/lobby-realtime-topic'
import { readSpectatorChatMessage } from '@/lib/spectator-chat'
import { readSpectatorCount } from '@/lib/shared/realtime-envelope'

describe('spectator topic', () => {
  it('carries the lobby secret, so the code alone does not reach it', () => {
    const topic = spectatorTopicFor(buildLobbyTopic('1234', 'lobby-secret'))
    expect(topic).toBe(buildSpectatorTopic('1234', 'lobby-secret'))
    expect(topic).toBe('spectators:1234:lobby-secret')
    expect(topic).not.toBe('spectators:1234')
  })

  it('is only derived from a real lobby topic', () => {
    expect(spectatorTopicFor('lobby:1234')).toBeNull()
    expect(spectatorTopicFor('user:1:tag')).toBeNull()
  })
})

describe('readSpectatorChatMessage', () => {
  const valid = { id: 'm-1', userId: 'u-1', username: 'Viewer', lobbyCode: '1234', message: ' hello ', timestamp: 5 }

  it('keeps a well-formed message for this lobby', () => {
    expect(readSpectatorChatMessage(valid, '1234')).toEqual({ ...valid, message: 'hello' })
  })

  it('drops messages for another lobby, empty or oversized ones, and non-strings', () => {
    expect(readSpectatorChatMessage(valid, '9999')).toBeNull()
    expect(readSpectatorChatMessage({ ...valid, message: '   ' }, '1234')).toBeNull()
    expect(readSpectatorChatMessage({ ...valid, message: 'x'.repeat(501) }, '1234')).toBeNull()
    expect(readSpectatorChatMessage({ ...valid, username: 'n'.repeat(65) }, '1234')).toBeNull()
    expect(readSpectatorChatMessage({ ...valid, id: 7 }, '1234')).toBeNull()
    expect(readSpectatorChatMessage(null, '1234')).toBeNull()
  })
})

describe('readSpectatorCount', () => {
  it('clamps a peer-reported count to a sane integer', () => {
    expect(readSpectatorCount({ count: 3 })).toBe(3)
    expect(readSpectatorCount({ count: 2.9 })).toBe(2)
    expect(readSpectatorCount({ count: -4 })).toBe(0)
    expect(readSpectatorCount({ count: 10 ** 9 })).toBe(500)
    expect(readSpectatorCount({ count: 'many' })).toBe(0)
    expect(readSpectatorCount(null)).toBe(0)
  })
})
