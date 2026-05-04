import {
  applyThemeMode,
  getStoredThemeMode,
  normalizeThemeMode,
  resolveThemeMode,
} from '@/lib/theme'

describe('theme helpers', () => {
  it('normalizes valid theme mode values', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('system')
  })

  it('falls back to system for unknown or empty values', () => {
    expect(normalizeThemeMode('unexpected')).toBe('system')
    expect(normalizeThemeMode(null)).toBe('system')
    expect(normalizeThemeMode(undefined)).toBe('system')
  })

  it('reads stored theme mode from storage', () => {
    expect(getStoredThemeMode({ getItem: () => 'dark' })).toBe('dark')
    expect(getStoredThemeMode({ getItem: () => 'light' })).toBe('light')
    expect(getStoredThemeMode({ getItem: () => 'weird' })).toBe('system')
    expect(getStoredThemeMode()).toBe('system')
  })

  it('resolves system mode using prefersDark', () => {
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
    expect(resolveThemeMode('light', true)).toBe('light')
  })

  it('applies light theme and removes dark class', () => {
    const documentElement = document.createElement('html')
    documentElement.classList.add('dark')

    applyThemeMode('light', { documentElement, matchMedia: () => ({ matches: false } as MediaQueryList) })
    expect(documentElement.classList.contains('dark')).toBe(false)
    expect(documentElement.style.colorScheme).toBe('light')
  })

  it('applies dark theme and adds dark class', () => {
    const documentElement = document.createElement('html')

    applyThemeMode('dark', { documentElement, matchMedia: () => ({ matches: false } as MediaQueryList) })
    expect(documentElement.classList.contains('dark')).toBe(true)
    expect(documentElement.style.colorScheme).toBe('dark')
  })
})
