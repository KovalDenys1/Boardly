import { toPersistedGameType } from '@/lib/game-type-storage'

describe('game type storage', () => {
  it.each([
    'telephone_doodle',
    'sketch_and_guess',
    'liars_party',
    'fake_artist',
  ] as const)('persists %s without downgrading to other', (gameType) => {
    expect(toPersistedGameType(gameType)).toBe(gameType)
  })

  it('falls back to other for unknown runtime game types', () => {
    expect(toPersistedGameType('unknown_runtime_game')).toBe('other')
  })
})
