import {
  advanceTurnPastDisconnectedPlayers,
  setPlayerConnectionInState,
  type TurnState,
} from '@/lib/disconnected-turn'

/**
 * #992: a player who left kept a fully valid seat, because the engine refuses to
 * remove anyone while a game is playing. The turn wheel came back round to them
 * and the match froze — no client submits a timeout for a foreign seat and these
 * game types have no server-side fallback. These two helpers existed for exactly
 * this and `setPlayerConnectionInState` had no caller anywhere, which is what the
 * leave path now supplies.
 */
function threeSeats(currentPlayerIndex: number): TurnState {
  return {
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    currentPlayerIndex,
    data: {},
  }
}

describe('ghost seat skipping (#992)', () => {
  const noBots = new Set<string>()

  it('marks the leaver inactive and stamps when they went', () => {
    const state = threeSeats(0)
    expect(setPlayerConnectionInState(state, 'C', false, 1_000)).toBe(true)
    const c = state.players![2]
    expect(c.isActive).toBe(false)
    expect(c.disconnectedAt).toBe(1_000)
  })

  it('steps off the departed seat when the leaver held the turn', () => {
    const state = threeSeats(2)
    setPlayerConnectionInState(state, 'C', false)
    const result = advanceTurnPastDisconnectedPlayers(state, noBots)
    expect(result.changed).toBe(true)
    expect(result.currentPlayerId).toBe('A')
    expect(result.skippedPlayerIds).toEqual(['C'])
  })

  it('the freeze case: the wheel reaches the departed seat a round later', () => {
    // C left on A's turn, so nothing moved at the time. Play advances normally
    // until the index lands on C — which is where the game used to die.
    const state = threeSeats(0)
    setPlayerConnectionInState(state, 'C', false)
    state.currentPlayerIndex = 2

    const result = advanceTurnPastDisconnectedPlayers(state, noBots)
    expect(result.changed).toBe(true)
    expect(result.currentPlayerId).toBe('A')
  })

  it('skips several departed seats in a row', () => {
    const state = threeSeats(1)
    setPlayerConnectionInState(state, 'B', false)
    setPlayerConnectionInState(state, 'C', false)
    const result = advanceTurnPastDisconnectedPlayers(state, noBots)
    expect(result.currentPlayerId).toBe('A')
    expect(result.skippedPlayerIds).toEqual(['B'])
  })

  it('never skips a bot: a bot is not a disconnected player', () => {
    const state = threeSeats(2)
    state.players![2].isActive = false
    const result = advanceTurnPastDisconnectedPlayers(state, new Set(['C']))
    expect(result.changed).toBe(false)
    expect(result.currentPlayerId).toBe('C')
  })

  it('leaves the turn alone when everyone still present is inactive', () => {
    const state = threeSeats(0)
    setPlayerConnectionInState(state, 'A', false)
    setPlayerConnectionInState(state, 'B', false)
    setPlayerConnectionInState(state, 'C', false)
    const result = advanceTurnPastDisconnectedPlayers(state, noBots)
    expect(result.currentPlayerId).toBe('A')
  })

  it('resets the Yahtzee scratch data when it moves the turn', () => {
    const state = threeSeats(2)
    state.data = { held: [true, true, false, false, true], rollsLeft: 0 }
    setPlayerConnectionInState(state, 'C', false)
    advanceTurnPastDisconnectedPlayers(state, noBots)
    expect(state.data!.held).toEqual([false, false, false, false, false])
    expect(state.data!.rollsLeft).toBe(3)
  })
})
