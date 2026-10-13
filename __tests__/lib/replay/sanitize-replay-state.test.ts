import { sanitizeReplayState } from '@/lib/replay/sanitize-replay-state'

describe('sanitizeReplayState', () => {
  it('empties the Alias deck bookkeeping and keeps the card', () => {
    const state = { data: { usedWordIndices: [3, 7, 9], currentCard: ['castle'], scores: { a: 2 } } }

    const out = sanitizeReplayState('alias', state)

    expect(out.data.usedWordIndices).toEqual([])
    expect(out.data.currentCard).toEqual(['castle'])
    expect(state.data.usedWordIndices).toEqual([3, 7, 9])
  })

  it('drops the undo snapshots of Tic-Tac-Toe and Connect Four and keeps the board', () => {
    const board = [[null, 'X', null]]
    expect(sanitizeReplayState('tic_tac_toe', { data: { board, undoSnapshots: [{ board }] } }).data).toEqual({ board, undoSnapshots: [] })
    expect(sanitizeReplayState('connect_four', { data: { board, undoSnapshots: [{ board }] } }).data.undoSnapshots).toEqual([])
  })

  it('strips Sketch & Guess custom words', () => {
    const out = sanitizeReplayState('sketch_and_guess', { data: { customWords: ['secret'], customWordsOnly: true, rounds: [] } })

    expect(out.data).toEqual({ rounds: [] })
  })

  it('returns every other state and shape untouched', () => {
    const memory = { data: { cards: [{ value: 'A' }], moveHistory: [] } }
    expect(sanitizeReplayState('memory', memory)).toBe(memory)
    expect(sanitizeReplayState('alias', { data: null })).toEqual({ data: null })
    expect(sanitizeReplayState('tic_tac_toe', { status: 'finished' })).toEqual({ status: 'finished' })
  })
})
