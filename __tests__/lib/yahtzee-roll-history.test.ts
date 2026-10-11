import fs from 'fs'
import path from 'path'
import { readStoredRollHistory, seedRollHistory, serializeRollHistory, scoreHistoryEntry } from '@/lib/yahtzee-roll-history'
import type { RollHistoryEntry } from '@/components/RollHistory'

/**
 * #1363: Recent Rolls lives in the browser. A page opened or reloaded mid-game
 * showed "No rolls yet" beside a 40:21 score, and the viewer's own scores were
 * never listed.
 */
const roll: RollHistoryEntry = {
  id: 'p1-1000',
  type: 'roll',
  turnNumber: 2,
  playerName: 'Ann',
  rollNumber: 1,
  dice: [1, 2, 3, 4, 5],
  held: [],
  timestamp: 1000,
}

describe('stored roll history', () => {
  it('comes back for the same game', () => {
    expect(readStoredRollHistory(serializeRollHistory('game-1', [roll]), 'game-1')).toEqual([roll])
  })

  it('is dropped for another game in the same lobby', () => {
    expect(readStoredRollHistory(serializeRollHistory('game-1', [roll]), 'game-2')).toEqual([])
  })

  it('ignores the old unkeyed shape and garbage', () => {
    expect(readStoredRollHistory(JSON.stringify([roll]), 'game-1')).toEqual([])
    expect(readStoredRollHistory('{not json', 'game-1')).toEqual([])
    expect(readStoredRollHistory(null, 'game-1')).toEqual([])
  })
})

describe('seedRollHistory', () => {
  const players = [
    { id: 'p1', name: 'Ann', isBot: false },
    { id: 'bot', name: 'Dice Strategist', isBot: true },
  ]

  it('lists every scored box, with its points, when the page has no history', () => {
    const entries = seedRollHistory({
      players,
      scorecards: [{ chance: 23, onePair: 10 }, { fullHouse: 25 }],
      rollsLeft: 3,
      currentPlayerId: 'p1',
      lastRoll: null,
    })
    const scores = entries.filter((entry) => entry.type === 'score')
    expect(scores.map((entry) => [entry.playerName, entry.category, entry.scoredPoints])).toEqual(
      expect.arrayContaining([
        ['Ann', 'chance', 23],
        ['Ann', 'onePair', 10],
        ['Dice Strategist', 'fullHouse', 25],
      ])
    )
    expect(scores).toHaveLength(3)
    expect(scores.find((entry) => entry.playerName === 'Dice Strategist')).toMatchObject({ isBot: true, botId: 'bot' })
  })

  it('ends with the roll of the turn in progress, under the id the live handlers use', () => {
    const entries = seedRollHistory({
      players,
      scorecards: [{ chance: 23 }, { fullHouse: 25 }],
      rollsLeft: 2,
      currentPlayerId: 'p1',
      lastRoll: { playerId: 'p1', dice: [6, 6, 2, 3, 1], rollNumber: 1, held: [true, true, false, false, false], timestamp: 5000 },
    })
    expect(entries[entries.length - 1]).toMatchObject({ id: 'p1-5000', type: 'roll', dice: [6, 6, 2, 3, 1], held: [0, 1], playerName: 'Ann' })
  })

  it('leaves out a last roll that was already scored', () => {
    const entries = seedRollHistory({
      players,
      scorecards: [{ chance: 23 }, {}],
      rollsLeft: 3,
      currentPlayerId: 'bot',
      lastRoll: { playerId: 'p1', dice: [6, 6, 2, 3, 6], rollNumber: 1, held: [false, false, false, false, false], timestamp: 5000 },
    })
    expect(entries.some((entry) => entry.type === 'roll')).toBe(false)
  })

  it('is empty before anyone has rolled', () => {
    expect(seedRollHistory({ players, scorecards: [{}, {}], rollsLeft: 3, currentPlayerId: 'p1', lastRoll: null })).toEqual([])
  })
})

describe('scoreHistoryEntry', () => {
  it('builds the id the broadcast handler builds, so the score is listed once', () => {
    expect(scoreHistoryEntry({ playerId: 'p1', playerName: 'Ann', category: 'chance', points: 23, turnNumber: 2, timestamp: 7000 })).toMatchObject({
      id: 'score-p1-chance-7000',
      type: 'score',
      category: 'chance',
      scoredPoints: 23,
      isBot: false,
    })
  })
})

describe('the lobby page wiring', () => {
  const root = path.join(__dirname, '..', '..')
  const page = fs.readFileSync(path.join(root, 'app/lobby/[code]/LobbyPageClient.tsx'), 'utf8')
  const actions = fs.readFileSync(path.join(root, 'app/lobby/[code]/hooks/useGameActions.ts'), 'utf8')

  it('restores the stored history for the game instead of wiping it on mount', () => {
    expect(page).toContain('readStoredRollHistory(')
    expect(page).toContain('seedRollHistory(')
    expect(page).not.toMatch(/initializedMobileUiGameIdRef\.current = game\.id[\s\S]{0,200}setRollHistory\(\[\]\)/)
  })

  it('lists the viewer’s own score', () => {
    expect(actions).toContain('scoreHistoryEntry(')
  })
})

describe('the score tiles', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app/globals.css'), 'utf8')

  it('size the number from the tile itself, so a tall tile is filled rather than empty inside', () => {
    const rule = css.match(/\.yz-grid \.yz-tile \.yz-tile__value\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/font-size:\s*clamp\([^)]*cqh[^)]*\)/)
    // Declared after every fixed-size override, so it wins at equal specificity.
    expect(css.lastIndexOf('.yz-grid .yz-tile .yz-tile__value')).toBeGreaterThan(css.lastIndexOf('.yz-panel--board .yz-tile--best .yz-tile__value'))
  })
})
