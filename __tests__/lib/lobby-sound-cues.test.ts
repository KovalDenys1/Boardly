import { lobbySoundCues } from '@/lib/lobby-sound-cues'
import { CUE_IDS, cuesInGroup, getCue } from '@/lib/sound-map'
import { getAvailableGameTypes } from '@/lib/game-catalog'

describe('lobbySoundCues (#1464)', () => {
  it('gives every lobby the core and social cues, and nothing else without a game', () => {
    expect(lobbySoundCues(null)).toEqual([...cuesInGroup('core'), ...cuesInGroup('social')])
  })

  it('adds only the game’s own group', () => {
    const yahtzee = lobbySoundCues('yahtzee')
    expect(yahtzee).toEqual(expect.arrayContaining(['dice.roll', 'die.hold', 'yahtzee.celebrate', 'turn.mine']))
    expect(yahtzee.some((cue) => getCue(cue).group === 'cards' || getCue(cue).group === 'pieces')).toBe(false)
    expect(lobbySoundCues('ludo')).toEqual(expect.arrayContaining(['die.roll', 'piece.hop']))
  })

  it('loads every group some playable game uses', () => {
    const groupsCovered = new Set(getAvailableGameTypes().flatMap(lobbySoundCues).map((cue) => getCue(cue).group))
    expect([...groupsCovered].sort()).toEqual([...new Set(CUE_IDS.map((cue) => getCue(cue).group))].sort())
  })
})
