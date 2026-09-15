import { resolveRequestedMaxPlayers } from '@/lib/lobby-create-query'
import { getCatalogGames } from '@/lib/game-catalog'

// Alias is the game the Discord /play deep link is written against, and its seat
// counts are deliberately not contiguous.
const ALIAS_PLAYERS = [4, 6, 8, 10, 12, 16]

describe('resolveRequestedMaxPlayers (#943)', () => {
  it('keeps the catalog as the source of truth for Alias seat counts', () => {
    // If the catalog changes, the cases below stop meaning what they say.
    const alias = getCatalogGames().find((g) => g.gameType === 'alias')
    expect(alias?.lobbyCreateConfig?.allowedPlayers).toEqual(ALIAS_PLAYERS)
  })

  it('accepts a count the game offers', () => {
    expect(resolveRequestedMaxPlayers('8', ALIAS_PLAYERS)).toBe(8)
    expect(resolveRequestedMaxPlayers('16', ALIAS_PLAYERS)).toBe(16)
  })

  it('tolerates surrounding whitespace', () => {
    expect(resolveRequestedMaxPlayers(' 8 ', ALIAS_PLAYERS)).toBe(8)
  })

  it('ignores a count above or below the game bounds', () => {
    expect(resolveRequestedMaxPlayers('2', ALIAS_PLAYERS)).toBeNull()
    expect(resolveRequestedMaxPlayers('20', ALIAS_PLAYERS)).toBeNull()
  })

  it('ignores a count inside the bounds the slider cannot select', () => {
    // 5 sits between 4 and 6 – in range, but Alias has no such seat count.
    expect(resolveRequestedMaxPlayers('5', ALIAS_PLAYERS)).toBeNull()
  })

  it('ignores anything that is not a whole number', () => {
    for (const value of ['', '   ', 'eight', '8.0', '8e0', '+8', '-8', '0x8', '8;drop']) {
      expect(resolveRequestedMaxPlayers(value, ALIAS_PLAYERS)).toBeNull()
    }
  })

  it('ignores a number too large to be an exact integer', () => {
    expect(resolveRequestedMaxPlayers('99999999999999999999', ALIAS_PLAYERS)).toBeNull()
  })

  it('ignores a missing parameter', () => {
    expect(resolveRequestedMaxPlayers(null, ALIAS_PLAYERS)).toBeNull()
    expect(resolveRequestedMaxPlayers(undefined, ALIAS_PLAYERS)).toBeNull()
  })

  it('ignores the parameter when the game has no seat list', () => {
    expect(resolveRequestedMaxPlayers('8', undefined)).toBeNull()
    expect(resolveRequestedMaxPlayers('8', [])).toBeNull()
  })

  it('accepts the only count of a fixed two-player game', () => {
    expect(resolveRequestedMaxPlayers('2', [2])).toBe(2)
    expect(resolveRequestedMaxPlayers('3', [2])).toBeNull()
  })

  it('never throws on hostile input', () => {
    expect(() => resolveRequestedMaxPlayers('Infinity', ALIAS_PLAYERS)).not.toThrow()
    expect(resolveRequestedMaxPlayers('Infinity', ALIAS_PLAYERS)).toBeNull()
    expect(resolveRequestedMaxPlayers('NaN', ALIAS_PLAYERS)).toBeNull()
  })
})
