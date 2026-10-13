import { fireEvent, render, screen } from '@testing-library/react'
import { AppearanceDevicePanels } from '@/components/profile/AppearanceDevicePanels'

const mockSetVolume = jest.fn()
let volume = 0.7

jest.mock('@/lib/theme', () => ({
  THEME_STORAGE_KEY: 'theme',
  DARK_MEDIA_QUERY: '(prefers-color-scheme: dark)',
  getStoredThemeMode: () => 'light',
  applyThemeMode: jest.fn(),
}))

jest.mock('@/lib/safe-storage', () => ({
  getSafeLocalStorage: () => null,
  writeLocal: jest.fn(),
}))

jest.mock('@/lib/sounds', () => ({
  sounds: {
    isEnabled: () => true,
    getVolume: () => volume,
    setVolume: (next: number) => {
      volume = next
      mockSetVolume(next)
    },
    toggle: jest.fn(() => false),
  },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('AppearanceDevicePanels', () => {
  it('offers the three theme tiles with the stored one pressed', () => {
    render(<AppearanceDevicePanels surfaceClassName="surface" />)

    const tiles = ['header.themeLight', 'header.themeSystem', 'header.themeDark'].map((name) =>
      screen.getByRole('button', { name }),
    )
    expect(tiles.map((tile) => tile.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('has a volume slider that writes through to the sound manager', () => {
    render(<AppearanceDevicePanels surfaceClassName="surface" />)

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.3' } })

    expect(mockSetVolume).toHaveBeenCalledWith(0.3)
    expect(screen.getByText('30%')).toBeTruthy()
  })
})
