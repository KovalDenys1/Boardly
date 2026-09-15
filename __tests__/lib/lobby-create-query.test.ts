import { readFileSync } from 'fs'
import { join } from 'path'

import { FREE_MAX_PLAYERS, resolveRequestedMaxPlayers } from '@/lib/lobby-create-query'
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

  it('mirrors the free-plan cap the create route enforces', () => {
    // FREE_MAX_PLAYERS is module-private in the route, so read the literal back. A drift
    // here means the form offers a size POST /api/lobby will answer 403 to.
    const route = readFileSync(join(process.cwd(), 'app/api/lobby/route.ts'), 'utf8')
    const declared = route.match(/const FREE_MAX_PLAYERS = (\d+)/)
    expect(declared).not.toBeNull()
    expect(Number(declared?.[1])).toBe(FREE_MAX_PLAYERS)
  })

  it('accepts a count the game offers', () => {
    expect(resolveRequestedMaxPlayers('8', ALIAS_PLAYERS, false)).toBe(8)
    expect(resolveRequestedMaxPlayers('10', ALIAS_PLAYERS, false)).toBe(10)
  })

  it('tolerates surrounding whitespace', () => {
    expect(resolveRequestedMaxPlayers(' 8 ', ALIAS_PLAYERS, false)).toBe(8)
  })

  it('ignores a count above or below the game bounds', () => {
    expect(resolveRequestedMaxPlayers('2', ALIAS_PLAYERS, true)).toBeNull()
    expect(resolveRequestedMaxPlayers('20', ALIAS_PLAYERS, true)).toBeNull()
  })

  it('ignores a count inside the bounds the slider cannot select', () => {
    // 5 sits between 4 and 6 – in range, but Alias has no such seat count.
    expect(resolveRequestedMaxPlayers('5', ALIAS_PLAYERS, true)).toBeNull()
  })

  it('ignores anything that is not a whole number', () => {
    for (const value of ['', '   ', 'eight', '8.0', '8e0', '+8', '-8', '0x8', '8;drop']) {
      expect(resolveRequestedMaxPlayers(value, ALIAS_PLAYERS, false)).toBeNull()
    }
  })

  it('ignores a number too large to be an exact integer', () => {
    expect(resolveRequestedMaxPlayers('99999999999999999999', ALIAS_PLAYERS, true)).toBeNull()
  })

  it('ignores a missing parameter', () => {
    expect(resolveRequestedMaxPlayers(null, ALIAS_PLAYERS, false)).toBeNull()
    expect(resolveRequestedMaxPlayers(undefined, ALIAS_PLAYERS, false)).toBeNull()
  })

  it('ignores the parameter when the game has no seat list', () => {
    expect(resolveRequestedMaxPlayers('8', undefined, false)).toBeNull()
    expect(resolveRequestedMaxPlayers('8', [], false)).toBeNull()
  })

  it('accepts the only count of a fixed two-player game', () => {
    expect(resolveRequestedMaxPlayers('2', [2], false)).toBe(2)
    expect(resolveRequestedMaxPlayers('3', [2], false)).toBeNull()
  })

  describe('the free-plan cap', () => {
    it('gives a free account the largest size it may actually create', () => {
      // 16 is a real Alias size, but POST /api/lobby answers 403 above 10 without Premium.
      expect(resolveRequestedMaxPlayers('16', ALIAS_PLAYERS, false)).toBe(10)
      expect(resolveRequestedMaxPlayers('12', ALIAS_PLAYERS, false)).toBe(10)
    })

    it('gives a Premium account the size the link asked for', () => {
      expect(resolveRequestedMaxPlayers('16', ALIAS_PLAYERS, true)).toBe(16)
    })

    it('does not cap a size already within the free plan', () => {
      expect(resolveRequestedMaxPlayers('8', ALIAS_PLAYERS, false)).toBe(8)
    })

    it('takes the largest allowed size under the cap, not the last listed', () => {
      expect(resolveRequestedMaxPlayers('16', [16, 4, 12, 6], false)).toBe(6)
    })

    it('falls back to the default when no allowed size fits the free plan', () => {
      expect(resolveRequestedMaxPlayers('16', [12, 16], false)).toBeNull()
    })
  })

  it('never throws on hostile input', () => {
    expect(() => resolveRequestedMaxPlayers('Infinity', ALIAS_PLAYERS, false)).not.toThrow()
    expect(resolveRequestedMaxPlayers('Infinity', ALIAS_PLAYERS, false)).toBeNull()
    expect(resolveRequestedMaxPlayers('NaN', ALIAS_PLAYERS, false)).toBeNull()
  })
})
