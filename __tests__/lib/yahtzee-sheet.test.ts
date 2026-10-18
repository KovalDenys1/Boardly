import { newlyScoredCategory, orderSheetPlayers, sheetLayout } from '@/lib/yahtzee-sheet'

describe('sheetLayout', () => {
  it('stacks short mode as nine rows under the header', () => {
    const layout = sheetLayout('short')
    expect(layout.canSplit).toBe(false)
    expect(layout.stackBodyRows).toBe(9)
    expect(layout.rows.map((row) => row.stackRow)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('stacks classic as the upper boxes, their sum and bonus, then the lower boxes', () => {
    const layout = sheetLayout('classic')
    const shown = layout.rows.filter((row) => row.stackRow !== null)
    expect(shown.map((row) => row.key)).toEqual([
      'ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'sum', 'bonus',
      'onePair', 'twoPairs', 'threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance',
    ])
    expect(shown.map((row) => row.stackRow)).toEqual(Array.from({ length: 17 }, (_, i) => i + 2))
    expect(layout.stackBodyRows).toBe(17)
  })

  it('splits classic into two sections of nine rows that share rows 2 to 10', () => {
    const layout = sheetLayout('classic')
    const upper = layout.rows.filter((row) => row.section === 'upper')
    const lower = layout.rows.filter((row) => row.section === 'lower')
    expect(upper.map((row) => row.splitRow)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(lower.map((row) => row.splitRow)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(upper.at(-1)).toMatchObject({ key: 'upperTotal', stackRow: null })
  })
})

describe('orderSheetPlayers', () => {
  const seats = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('puts the viewer first and keeps the others in seat order', () => {
    expect(orderSheetPlayers(seats, 'c').map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps seat order for a spectator', () => {
    expect(orderSheetPlayers(seats, 'nobody').map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(orderSheetPlayers(seats, null).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('newlyScoredCategory', () => {
  it('names the box a card gained', () => {
    expect(newlyScoredCategory({ ones: 3 }, { ones: 3, chance: 20 })).toBe('chance')
  })

  it('is null with no previous card, no change or a step back', () => {
    expect(newlyScoredCategory(undefined, { chance: 20 })).toBeNull()
    expect(newlyScoredCategory({ chance: 20 }, { chance: 20 })).toBeNull()
    expect(newlyScoredCategory({ chance: 20, ones: 2 }, { chance: 20 })).toBeNull()
  })
})
