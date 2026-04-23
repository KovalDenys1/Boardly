import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { AliasGame } from '@/lib/games/alias'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'

describe('restoreGameEngineClient', () => {
  it('restores Alias client engines even when Alias is not publicly enabled', async () => {
    const engine = await restoreGameEngineClient('alias', 'game-alias', {
      players: [],
      status: 'waiting',
    })

    expect(engine).toBeInstanceOf(AliasGame)
  })

  it('falls back to Yahtzee for unknown game types', async () => {
    const engine = await restoreGameEngineClient('unknown_game', 'game-unknown', {
      players: [],
      status: 'waiting',
    })

    expect(engine).toBeInstanceOf(YahtzeeGame)
  })
})
