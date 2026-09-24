import { buildScorecardTiles, pickBestCategory } from '@/lib/yahtzee-tiles'

/**
 * #1187: the tile grid shows each box as scored, +N, 0 or open, and exactly
 * one best move. The mockup's state - 3-3-3-5-6, six boxes filled - is the
 * reference case: Three of a Kind and Chance both make 20, and Chance loses.
 */
const mockupCard = { ones: 3, twos: 6, fours: 12, onePair: 10, fullHouse: 25, smallStraight: 30 }
const mockupDice = [3, 3, 3, 5, 6]

describe('buildScorecardTiles', () => {
  it('marks filled boxes scored with their value', () => {
    const model = buildScorecardTiles({ scorecard: mockupCard, mode: 'classic', dice: mockupDice, canScore: true })
    const ones = model.tiles.find((t) => t.category === 'ones')!
    expect(ones).toMatchObject({ state: 'scored', value: 3, isBest: false })
  })

  it('shows what the roll would score on open boxes, and 0 as its own state', () => {
    const model = buildScorecardTiles({ scorecard: mockupCard, mode: 'classic', dice: mockupDice, canScore: true })
    const byCat = Object.fromEntries(model.tiles.map((t) => [t.category, t]))
    expect(byCat.threes).toMatchObject({ state: 'potential', value: 9 })
    expect(byCat.fives).toMatchObject({ state: 'potential', value: 5 })
    expect(byCat.chance).toMatchObject({ state: 'potential', value: 20 })
    expect(byCat.fourOfKind).toMatchObject({ state: 'zero', value: 0 })
    expect(byCat.yahtzee).toMatchObject({ state: 'zero', value: 0 })
  })

  it('has exactly one best tile, and Chance loses a tie', () => {
    const model = buildScorecardTiles({ scorecard: mockupCard, mode: 'classic', dice: mockupDice, canScore: true })
    const best = model.tiles.filter((t) => t.isBest)
    expect(best).toHaveLength(1)
    expect(best[0].category).toBe('threeOfKind')
    expect(model.best).toBe('threeOfKind')
  })

  it('totals the card and says what the best pick would bring it to', () => {
    const model = buildScorecardTiles({ scorecard: mockupCard, mode: 'classic', dice: mockupDice, canScore: true })
    expect(model.total).toBe(86)
    expect(model.totalIfBest).toBe(106)
    expect(model.lowerTotal).toBe(65)
  })

  it('shows the upper section against par: three of each face scored so far', () => {
    const model = buildScorecardTiles({ scorecard: mockupCard, mode: 'classic', dice: mockupDice, canScore: true })
    expect(model.upper).toEqual({ total: 21, par: 21, target: 63, bonusEarned: false })
  })

  it('adds the 35 bonus once the upper section reaches 63', () => {
    const card = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }
    const model = buildScorecardTiles({ scorecard: card, mode: 'classic', dice: mockupDice, canScore: false })
    expect(model.upper?.bonusEarned).toBe(true)
    expect(model.total).toBe(63 + 35)
  })

  it('shows open boxes without numbers when the viewer cannot score', () => {
    const model = buildScorecardTiles({ scorecard: mockupCard, mode: 'classic', dice: mockupDice, canScore: false })
    const open = model.tiles.filter((t) => t.state !== 'scored')
    expect(open.every((t) => t.state === 'open' && t.value === null && !t.isBest)).toBe(true)
    expect(model.best).toBeNull()
    expect(model.totalIfBest).toBeNull()
  })

  it('has 9 lower-section tiles and no upper progress in short mode', () => {
    const model = buildScorecardTiles({ scorecard: {}, mode: 'short', dice: mockupDice, canScore: true })
    expect(model.tiles).toHaveLength(9)
    expect(model.tiles.every((t) => t.section === 'lower')).toBe(true)
    expect(model.upper).toBeNull()
    expect(model.best).toBe('threeOfKind')
  })

  it('suggests the cheapest box to burn when nothing scores', () => {
    // Only Four of a Kind and Yahtzee are open, and this roll makes neither.
    const allButYahtzeeAndFour = {
      ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
      onePair: 2, twoPairs: 6, threeOfKind: 7, fullHouse: 25, smallStraight: 30,
      largeStraight: 40, chance: 15,
    }
    const model = buildScorecardTiles({ scorecard: allButYahtzeeAndFour, mode: 'classic', dice: [1, 2, 3, 4, 6], canScore: true })
    expect(model.best).toBe('fourOfKind')
    expect(model.tiles.find((t) => t.isBest)).toMatchObject({ category: 'fourOfKind', state: 'zero', value: 0 })
  })
})

describe('pickBestCategory', () => {
  it('prefers anything over Chance on a tie, whatever the order', () => {
    expect(pickBestCategory([{ category: 'chance', score: 20 }, { category: 'threeOfKind', score: 20 }])).toBe('threeOfKind')
  })

  it('still picks Chance when it alone scores the most', () => {
    expect(pickBestCategory([{ category: 'chance', score: 22 }, { category: 'sixes', score: 12 }])).toBe('chance')
  })

  it('breaks other ties in scorecard order', () => {
    expect(pickBestCategory([{ category: 'fives', score: 10 }, { category: 'onePair', score: 10 }])).toBe('fives')
  })

  it('returns null with no open boxes', () => {
    expect(pickBestCategory([])).toBeNull()
  })
})
