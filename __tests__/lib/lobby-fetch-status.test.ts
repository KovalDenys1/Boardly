import { isLobbyGoneStatus } from '@/lib/lobby-fetch-status'

/**
 * #991 / #987: the one rule deciding whether a failed lobby fetch takes a player
 * out of a live game. Four pages share it; the statuses that must NOT eject are
 * the whole point, so they are asserted one by one.
 */
describe('isLobbyGoneStatus', () => {
  it.each([404, 403, 410])('treats %i as a lobby that is really gone', (status) => {
    expect(isLobbyGoneStatus(status)).toBe(true)
  })

  it.each([429, 500, 502, 503, 504, 408, 400, 401])('keeps the board on %i', (status) => {
    expect(isLobbyGoneStatus(status)).toBe(false)
  })
})
