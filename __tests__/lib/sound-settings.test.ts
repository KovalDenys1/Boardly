describe('sound settings', () => {
  let settings: typeof import('@/lib/sound-settings')

  beforeEach(() => {
    localStorage.clear()
    jest.isolateModules(() => {
      settings = require('@/lib/sound-settings')
    })
  })

  it('reads the keys the old sound manager wrote', () => {
    localStorage.setItem('soundEnabled', 'false')
    localStorage.setItem('soundVolume', '0.35')

    expect(settings.getSoundSettings()).toEqual({ enabled: false, volume: 0.35 })
  })

  it('defaults to on at 0.7 and clamps a stored volume to 0..1', () => {
    expect(settings.getSoundSettings()).toEqual({ enabled: true, volume: 0.7 })
    jest.isolateModules(() => {
      localStorage.setItem('soundVolume', '4')
      expect(require('@/lib/sound-settings').getSoundVolume()).toBe(1)
    })
  })

  it('writes the same strings back and announces each change once', () => {
    const listener = jest.fn()
    const unsubscribe = settings.subscribeSoundSettings(listener)

    expect(settings.toggleSoundEnabled()).toBe(false)
    settings.setSoundVolume(0.4)
    settings.setSoundVolume(0.4)

    expect(localStorage.getItem('soundEnabled')).toBe('false')
    expect(localStorage.getItem('soundVolume')).toBe('0.4')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('keeps the same snapshot object until something changes', () => {
    const first = settings.getSoundSettings()
    expect(settings.getSoundSettings()).toBe(first)
    settings.setSoundEnabled(false)
    expect(settings.getSoundSettings()).not.toBe(first)
  })

  it('follows a change made in another tab', () => {
    const listener = jest.fn()
    settings.subscribeSoundSettings(listener)
    settings.getSoundSettings()

    localStorage.setItem('soundEnabled', 'false')
    window.dispatchEvent(new StorageEvent('storage', { key: 'soundEnabled' }))

    expect(settings.isSoundEnabled()).toBe(false)
    expect(listener).toHaveBeenCalled()
  })
})
