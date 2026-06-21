import { resolveBotTarget } from '@/lib/quick-play'

describe('resolveBotTarget', () => {
  it('guarantees at least one bot for forceSolo (Play vs Bot) even when minPlayers is 1', () => {
    // Yahtzee: minPlayers 1 — without this, fillWithBots would add zero bots
    // despite the player explicitly choosing a difficulty (#631).
    expect(resolveBotTarget(1, true)).toBe(2)
  })

  it('leaves multi-player-minimum games unaffected for forceSolo', () => {
    // Tic-Tac-Toe: minPlayers 2 — already guarantees an opponent.
    expect(resolveBotTarget(2, true)).toBe(2)
    expect(resolveBotTarget(4, true)).toBe(4)
  })

  it('does not change ordinary quick-play matchmaking (forceSolo: false)', () => {
    expect(resolveBotTarget(1, false)).toBe(1)
    expect(resolveBotTarget(2, false)).toBe(2)
    expect(resolveBotTarget(4, false)).toBe(4)
  })
})
