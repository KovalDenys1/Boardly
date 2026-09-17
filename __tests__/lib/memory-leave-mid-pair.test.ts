import { getGameMetadata } from '@/lib/game-catalog'

/**
 * #990: leaving mid-pair used to clear the tracking arrays but leave the two
 * cards face up — a state the engine never produces, which stalled the bot's
 * turn forever. This locks the shape of the reset that lobby-leave applies.
 */
describe('memory turn reset on leave (#990)', () => {
  it('declares the reset keys lobby-leave applies', () => {
    expect(getGameMetadata('memory')?.turnResetOnLeave).toEqual({
      flippedCardIds: [],
      pendingMismatchCardIds: [],
      advanceTurnAfterMove: false,
    })
  })

  it('turns every unmatched face-up card back down, matching what the arrays claim', () => {
    // The transformation lobby-leave performs after applying turnResetOnLeave.
    const cards = [
      { id: 'a', isFlipped: true, isMatched: false },
      { id: 'b', isFlipped: true, isMatched: false },
      { id: 'c', isFlipped: true, isMatched: true },
      { id: 'd', isFlipped: false, isMatched: false },
    ]
    const reset = cards.map((card) =>
      card.isFlipped === true && card.isMatched !== true ? { ...card, isFlipped: false } : card
    )

    expect(reset.filter((c) => c.isFlipped && !c.isMatched)).toHaveLength(0)
    // A matched pair stays face up — it is part of the board, not of the turn.
    expect(reset.find((c) => c.id === 'c')?.isFlipped).toBe(true)
    expect(reset.find((c) => c.id === 'd')?.isFlipped).toBe(false)
  })
})
