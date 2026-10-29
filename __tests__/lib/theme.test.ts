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

  describe('switching the theme', () => {
    const noDark = () => ({ matches: false }) as MediaQueryList
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('holds every transition while the colours swap, then lets them run again', () => {
      const documentElement = document.createElement('html')

      applyThemeMode('dark', { documentElement, matchMedia: noDark })
      expect(documentElement.classList.contains('dark')).toBe(true)
      expect(documentElement.classList.contains('bd-theme-switching')).toBe(true)

      jest.runAllTimers()
      expect(documentElement.classList.contains('bd-theme-switching')).toBe(false)
    })

    it('leaves transitions alone when the theme does not change', () => {
      const documentElement = document.createElement('html')
      documentElement.classList.add('dark')

      applyThemeMode('dark', { documentElement, matchMedia: noDark })
      expect(documentElement.classList.contains('bd-theme-switching')).toBe(false)
    })

    it('globals.css stops transitions on everything under the switching class', () => {
      const css = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8') as string
      expect(css).toMatch(/\.bd-theme-switching \*,\s*\.bd-theme-switching \*::before,\s*\.bd-theme-switching \*::after \{\s*transition: none !important;/)
    })
  })
})
