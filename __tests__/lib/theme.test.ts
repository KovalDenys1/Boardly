import {
  applyThemeMode,
  getStoredThemeMode,
  normalizeThemeMode,
  resolveThemeMode,
} from '@/lib/theme'

describe('theme helpers', () => {
  it('normalizes theme mode values', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('unexpected')).toBe('system')
    expect(normalizeThemeMode(null)).toBe('system')
  })

  it('reads a stored theme mode safely', () => {
    expect(getStoredThemeMode({ getItem: () => 'dark' })).toBe('dark')
    expect(getStoredThemeMode({ getItem: () => 'weird' })).toBe('system')
    expect(getStoredThemeMode()).toBe('system')
  })

  it('resolves system theme mode against media preference', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
  })

  it('applies the correct class and color scheme to the document element', () => {
    const documentElement = document.createElement('html')
    const matchMedia = jest.fn().mockReturnValue({ matches: true })

    applyThemeMode('system', { documentElement, matchMedia })
    expect(documentElement.classList.contains('dark')).toBe(true)
    expect(documentElement.style.colorScheme).toBe('dark')

    applyThemeMode('light', { documentElement, matchMedia })
    expect(documentElement.classList.contains('dark')).toBe(false)
    expect(documentElement.style.colorScheme).toBe('light')
  })
})
