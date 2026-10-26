import { activeSeatId, buildSeats, winnerSeatId } from '@/lib/replay/seats'

const players = [
  { userId: 'b', username: 'Bea', isBot: false, position: 1 },
  { userId: 'a', username: null, isBot: true, position: 0 },
]

describe('buildSeats', () => {
  it('follows the engine order of the first snapshot', () => {
    const seats = buildSeats(players, { players: [{ id: 'b' }, { id: 'a' }] }, 'Player')
    expect(seats.map((s) => [s.userId, s.seat, s.name])).toEqual([['b', 0, 'Bea'], ['a', 1, 'Player']])
  })

  it('falls back to the stored seat position without a start snapshot', () => {
    expect(buildSeats(players, null, 'Player').map((s) => s.userId)).toEqual(['a', 'b'])
  })
})

describe('active and winning seats', () => {
  const state = { status: 'playing', players: [{ id: 'a' }, { id: 'b' }], currentPlayerIndex: 1 }
  it('names whose move it is while the game runs and the winner once it is over', () => {
    expect(activeSeatId(state)).toBe('b')
    expect(activeSeatId({ ...state, status: 'finished' })).toBeNull()
    expect(winnerSeatId({ ...state, status: 'finished', winner: 'a' })).toBe('a')
    expect(winnerSeatId({ ...state, status: 'finished', winner: 'draw' })).toBeNull()
  })
})
