import { renderHook } from '@testing-library/react'
import { useSoundConsumer } from '@/hooks/useSoundConsumer'
import { retainSounds } from '@/lib/sound-engine'

const mockRelease = jest.fn()

jest.mock('@/lib/sound-engine', () => ({
  retainSounds: jest.fn(() => mockRelease),
}))

const retain = retainSounds as jest.Mock

describe('useSoundConsumer', () => {
  beforeEach(() => {
    retain.mockClear()
    mockRelease.mockClear()
  })

  it('retains the engine with its cues on mount and releases it on unmount', () => {
    const { unmount } = renderHook(() => useSoundConsumer(['ui.select', 'dice.roll']))
    expect(retain).toHaveBeenCalledWith(['ui.select', 'dice.roll'])

    unmount()
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('keeps one retain across re-renders with an equal cue list', () => {
    const { rerender } = renderHook(({ cues }) => useSoundConsumer(cues), { initialProps: { cues: ['ui.select'] as const } })
    rerender({ cues: ['ui.select'] as const })
    expect(retain).toHaveBeenCalledTimes(1)
    expect(mockRelease).not.toHaveBeenCalled()
  })
})
