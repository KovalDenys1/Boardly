import { fireEvent, render, screen } from '@testing-library/react'
import { AppearanceDevicePanels } from '@/components/profile/AppearanceDevicePanels'

const mockWriteLocal = jest.fn()

jest.mock('@/lib/theme', () => ({
  THEME_STORAGE_KEY: 'theme',
  DARK_MEDIA_QUERY: '(prefers-color-scheme: dark)',
  getStoredThemeMode: () => 'light',
  applyThemeMode: jest.fn(),
}))

jest.mock('@/lib/safe-storage', () => ({
  getSafeLocalStorage: () => null,
  readLocal: () => null,
  writeLocal: (key: string, value: string) => mockWriteLocal(key, value),
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

  it('has a volume slider that writes through to the stored sound setting', () => {
    render(<AppearanceDevicePanels surfaceClassName="surface" />)

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.3' } })

    expect(mockWriteLocal).toHaveBeenCalledWith('soundVolume', '0.3')
    expect(screen.getByText('30%')).toBeTruthy()
  })

  it('tells an iPhone viewer that the silent switch mutes game sounds, and nobody else', () => {
    const { unmount } = render(<AppearanceDevicePanels surfaceClassName="surface" />)
    expect(screen.queryByText('header.silentSwitchHint')).toBeNull()
    unmount()

    const userAgent = jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    )
    render(<AppearanceDevicePanels surfaceClassName="surface" />)
    expect(screen.getByText('header.silentSwitchHint')).toBeTruthy()
    userAgent.mockRestore()
  })
})
