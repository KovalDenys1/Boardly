import {
  getStoredAppearanceLocale,
  getStoredAppearancePreferences,
  normalizeAppearanceLocale,
  setStoredAppearanceLocale,
  setStoredThemePreference,
} from '@/lib/appearance-preferences'

describe('appearance preference helpers', () => {
  it('normalizes locale values safely', () => {
    expect(normalizeAppearanceLocale('en-US')).toBe('en')
    expect(normalizeAppearanceLocale('RU')).toBe('ru')
    expect(normalizeAppearanceLocale('unknown')).toBe('en')
    expect(normalizeAppearanceLocale(null)).toBe('en')
  })

  it('prefers i18nextLng when reading stored locale', () => {
    const storage = {
      getItem: (key: string) => {
        if (key === 'i18nextLng') return 'uk-UA'
        if (key === 'language') return 'ru'
        return null
      },
    }

    expect(getStoredAppearanceLocale(storage)).toBe('uk')
  })

  it('writes locale into both storage keys', () => {
    const setItem = jest.fn()

    expect(setStoredAppearanceLocale({ setItem }, 'no-NO')).toBe('no')
    expect(setItem).toHaveBeenCalledWith('i18nextLng', 'no')
    expect(setItem).toHaveBeenCalledWith('language', 'no')
  })

  it('builds a full appearance snapshot from storage', () => {
    const storage = {
      getItem: (key: string) => {
        if (key === 'i18nextLng') return 'ru'
        if (key === 'theme') return 'dark'
        return null
      },
    }

    expect(getStoredAppearancePreferences(storage)).toEqual({
      language: 'ru',
      theme: 'dark',
    })
  })

  it('normalizes and stores theme preferences safely', () => {
    const setItem = jest.fn()

    expect(setStoredThemePreference({ setItem }, 'weird')).toBe('system')
    expect(setItem).toHaveBeenCalledWith('theme', 'system')
  })
})
