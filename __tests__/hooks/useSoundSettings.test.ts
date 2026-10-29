import { act, renderHook } from '@testing-library/react'
import { useSoundSettings } from '@/hooks/useSoundSettings'
import { setSoundEnabled, setSoundVolume } from '@/lib/sound-settings'

describe('useSoundSettings', () => {
  beforeEach(() => {
    setSoundEnabled(true)
    setSoundVolume(0.7)
  })

  it('follows a change made by another control, as the lobby top bar must when the header mutes', () => {
    const lobbyTopBar = renderHook(() => useSoundSettings())
    expect(lobbyTopBar.result.current.enabled).toBe(true)

    act(() => setSoundEnabled(false))
    expect(lobbyTopBar.result.current.enabled).toBe(false)

    act(() => setSoundVolume(0.25))
    expect(lobbyTopBar.result.current).toEqual({ enabled: false, volume: 0.25 })
  })
})
