import {
  applyThemeMode,
  getStoredThemeMode,
  normalizeThemeMode,
  resolveThemeMode,
} from '@/lib/theme'

describe('theme helpers', () => {
  it('normalizes every theme mode value to light while redesign mode is active', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('light')
    expect(normalizeThemeMode('system')).toBe('light')
    expect(normalizeThemeMode('unexpected')).toBe('light')
    expect(normalizeThemeMode(null)).toBe('light')
  })

  it('ignores stored theme mode while redesign mode is active', () => {
    expect(getStoredThemeMode({ getItem: () => 'dark' })).toBe('light')
    expect(getStoredThemeMode({ getItem: () => 'weird' })).toBe('light')
    expect(getStoredThemeMode()).toBe('light')
  })

  it('always resolves to light', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
  })

  it('always removes the dark class and applies a light color scheme', () => {
    const documentElement = document.createElement('html')
    documentElement.classList.add('dark')

    applyThemeMode('light', { documentElement })
    expect(documentElement.classList.contains('dark')).toBe(false)
    expect(documentElement.style.colorScheme).toBe('light')
  })
})
