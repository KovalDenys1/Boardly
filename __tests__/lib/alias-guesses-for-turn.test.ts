import { guessesForTurn } from '@/lib/games/alias-guess'

describe('guessesForTurn', () => {
  const guesses = [
    { id: 'g1', text: 'clock?', at: 1_000 },
    { id: 'g2', text: 'swing', at: 1_500 },
    { id: 'g3', text: 'hourglass', at: 9_000 },
  ]

  it('keeps only the guesses made since the turn on screen started', () => {
    expect(guessesForTurn(guesses, 1_000).map((g) => g.id)).toEqual(['g1', 'g2', 'g3'])
    expect(guessesForTurn(guesses, 8_000).map((g) => g.id)).toEqual(['g3'])
    expect(guessesForTurn(guesses, 10_000)).toEqual([])
    expect(guessesForTurn(guesses, null)).toEqual([])
  })
})
