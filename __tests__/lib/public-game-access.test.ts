import {
  getPublicAvailableGameTypes,
  isPublicAvailableGameType,
} from '@/lib/public-game-access'

describe('public game access', () => {
  it('returns the stable public game types by default', () => {
    expect(getPublicAvailableGameTypes({ aliasEnabled: false })).toEqual([
      'yahtzee',
      'guess_the_spy',
      'tic_tac_toe',
      'rock_paper_scissors',
      'memory',
    ])
  })

  it('includes alias only when its public flag is enabled', () => {
    expect(getPublicAvailableGameTypes({ aliasEnabled: true })).toContain('alias')
    expect(getPublicAvailableGameTypes({ aliasEnabled: false })).not.toContain('alias')
  })

  it('recognizes only public game types as selectable', () => {
    expect(isPublicAvailableGameType('rock_paper_scissors', { aliasEnabled: false })).toBe(true)
    expect(isPublicAvailableGameType('alias', { aliasEnabled: true })).toBe(true)
    expect(isPublicAvailableGameType('liars_party', { aliasEnabled: true })).toBe(false)
  })
})
