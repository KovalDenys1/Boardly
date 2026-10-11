import { act, renderHook } from '@testing-library/react'
import { useStoredRollHistory } from '@/hooks/useStoredRollHistory'
import { serializeRollHistory } from '@/lib/yahtzee-roll-history'
import type { RollHistoryEntry } from '@/components/RollHistory'

const entry = (id: string): RollHistoryEntry => ({ id, type: 'roll', turnNumber: 1, playerName: 'Ann', rollNumber: 1, dice: [1, 2, 3, 4, 5], timestamp: 1 })

describe('useStoredRollHistory', () => {
  beforeEach(() => window.localStorage.clear())

  it('brings the history back after a reload of the same game', () => {
    window.localStorage.setItem('rollHistory_AB12', serializeRollHistory('game-1', [entry('a'), entry('b')]))
    const { result } = renderHook(() => useStoredRollHistory('AB12', 'game-1', true))
    expect(result.current[0].map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('starts a rematch empty even when the old game is still in memory, and never files it under the new game', () => {
    const { result, rerender } = renderHook(({ gameId }) => useStoredRollHistory('AB12', gameId, true), { initialProps: { gameId: 'game-1' } })
    act(() => result.current[1]([entry('old')]))
    expect(result.current[0]).toHaveLength(1)

    rerender({ gameId: 'game-2' })
    expect(result.current[0]).toEqual([])
    expect(window.localStorage.getItem('rollHistory_AB12') ?? '').not.toContain('"game-2"')

    act(() => result.current[1]([entry('new')]))
    expect(JSON.parse(window.localStorage.getItem('rollHistory_AB12')!)).toEqual({ gameId: 'game-2', entries: [entry('new')] })
  })

  it('waits for the game to start before reading storage', () => {
    window.localStorage.setItem('rollHistory_AB12', serializeRollHistory('game-1', [entry('a')]))
    const { result, rerender } = renderHook(({ active }) => useStoredRollHistory('AB12', 'game-1', active), { initialProps: { active: false } })
    expect(result.current[0]).toEqual([])
    rerender({ active: true })
    expect(result.current[0].map((e) => e.id)).toEqual(['a'])
  })
})
