import { act, renderHook } from '@testing-library/react'
import { isRemoteRollArrival, resolveScorecardPlayerId, rollSignature } from '@/lib/yahtzee-motion'
import { REMOTE_ROLL_ANIMATION_MS, useRemoteRoll } from '@/hooks/useRemoteRoll'

const roll = (playerId: string, rollNumber: number, timestamp: number) => ({ playerId, rollNumber, timestamp })

describe('yahtzee motion', () => {
  it('signs a roll by who, which roll and when', () => {
    expect(rollSignature(undefined)).toBeNull()
    expect(rollSignature(roll('bot', 2, 100))).toBe('bot:2:100')
  })

  it('animates an opponent roll, never the snapshot, a repeat or the viewer’s own', () => {
    expect(isRemoteRollArrival(undefined, roll('bot', 1, 1), 'me')).toBe(false)
    expect(isRemoteRollArrival(null, roll('bot', 1, 1), 'me')).toBe(true)
    expect(isRemoteRollArrival('bot:1:1', roll('bot', 1, 1), 'me')).toBe(false)
    expect(isRemoteRollArrival('bot:1:1', roll('bot', 2, 2), 'me')).toBe(true)
    expect(isRemoteRollArrival('bot:2:2', roll('me', 1, 3), 'me')).toBe(false)
  })

  it('shows an explicit pick, else the lingering card, else the current player', () => {
    expect(resolveScorecardPlayerId('picked', 'linger', 'current')).toBe('picked')
    expect(resolveScorecardPlayerId(null, 'linger', 'current')).toBe('linger')
    expect(resolveScorecardPlayerId(null, null, 'current')).toBe('current')
    expect(resolveScorecardPlayerId(null, null, undefined)).toBeNull()
  })
})

describe('useRemoteRoll', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('is true for one animation after a bot roll arrives', () => {
    type P = { r: ReturnType<typeof roll> | undefined }
    const { result, rerender } = renderHook(({ r }: P) => useRemoteRoll(r, 'me', true), {
      initialProps: { r: roll('bot', 1, 1) } as P,
    })
    expect(result.current).toBe(false)
    rerender({ r: roll('bot', 2, 2) })
    expect(result.current).toBe(true)
    act(() => { jest.advanceTimersByTime(REMOTE_ROLL_ANIMATION_MS) })
    expect(result.current).toBe(false)
    rerender({ r: roll('me', 1, 3) })
    expect(result.current).toBe(false)
  })
})
