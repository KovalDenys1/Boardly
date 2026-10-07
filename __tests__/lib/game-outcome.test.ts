import { hasTopScore, viewerOutcome } from '@/lib/game-outcome'

describe('viewerOutcome', () => {
  const finished = { isFinished: true, isDraw: false, isSpectator: false, isSeated: true }

  it('names a win, a loss and a draw from the viewer seat', () => {
    expect(viewerOutcome({ ...finished, isViewerWinner: true })).toBe('win')
    expect(viewerOutcome({ ...finished, isViewerWinner: false })).toBe('loss')
    expect(viewerOutcome({ ...finished, isDraw: true, isViewerWinner: null })).toBe('draw')
  })

  it('on a 5/5/2 finish, a draw for the two at the top and a loss for the third', () => {
    const scores = { a: 5, b: 5, c: 2 }
    const ids = ['a', 'b', 'c']
    const outcomeFor = (id: string) =>
      viewerOutcome({ ...finished, isDraw: true, isViewerWinner: null, isViewerAtTop: hasTopScore(scores, ids, id) })
    expect(outcomeFor('a')).toBe('draw')
    expect(outcomeFor('b')).toBe('draw')
    expect(outcomeFor('c')).toBe('loss')
  })

  it('gives no verdict to a spectator, an unseated viewer, a running game or an unknown winner', () => {
    expect(viewerOutcome({ ...finished, isSpectator: true, isViewerWinner: true })).toBeUndefined()
    expect(viewerOutcome({ ...finished, isSeated: false, isViewerWinner: false })).toBeUndefined()
    expect(viewerOutcome({ ...finished, isFinished: false, isViewerWinner: true })).toBeUndefined()
    expect(viewerOutcome({ ...finished, isViewerWinner: null })).toBeUndefined()
  })
})
