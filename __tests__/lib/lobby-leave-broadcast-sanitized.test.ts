import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * #1274: the advanceTurnOnLeave branch sent the raw engine state, so a player
 * leaving a live Memory game broadcast every face-down card to the lobby topic.
 * Every game-update lobby-leave emits must go through sanitizeStateForBroadcast.
 */
describe('lobby-leave game-update broadcasts (#1274)', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/lobby-leave.ts'), 'utf8')
  const emissions = source.split("'game-update'").slice(1).map((after) => after.slice(0, 400))

  it('emits at least one game-update', () => {
    expect(emissions.length).toBeGreaterThan(0)
  })

  it.each(emissions.map((body, index) => [index, body]))('sanitizes game-update #%i', (_index, body) => {
    expect(body).toMatch(/sanitizeStateForBroadcast\(/)
    expect(body).not.toMatch(/payload:\s*result\.state\b/)
  })
})
