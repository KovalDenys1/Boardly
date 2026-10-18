import { fireEvent, render, screen } from '@testing-library/react'
import { QuickSettingsRow } from '@/components/Header/QuickSettingsRow'

const mockApplyThemeMode = jest.fn()
const mockWriteLocal = jest.fn()
let storedTheme = 'system'

jest.mock('@/lib/theme', () => ({
  THEME_STORAGE_KEY: 'theme',
  DARK_MEDIA_QUERY: '(prefers-color-scheme: dark)',
  getStoredThemeMode: () => storedTheme,
  applyThemeMode: (...args: unknown[]) => mockApplyThemeMode(...args),
}))

jest.mock('@/lib/safe-storage', () => ({
  getSafeLocalStorage: () => null,
  readLocal: () => null,
  writeLocal: (key: string, value: string) => {
    if (key === 'theme') storedTheme = value
    mockWriteLocal(key, value)
  },
}))

jest.mock('@/components/LanguageSwitcher', () => ({
  __esModule: true,
  default: ({ anchor }: { anchor?: string }) => <div data-testid="language-switcher" data-anchor={anchor} />,
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('QuickSettingsRow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    storedTheme = 'system'
  })

  it('switches the theme and marks the chosen mode as pressed', () => {
    render(<QuickSettingsRow />)

    expect(screen.getByRole('button', { name: 'header.themeSystem' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'header.themeDark' }))

    expect(mockWriteLocal).toHaveBeenCalledWith('theme', 'dark')
    expect(mockApplyThemeMode).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('button', { name: 'header.themeDark' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'header.themeSystem' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('mutes on tap and offers unmute afterwards', () => {
    render(<QuickSettingsRow />)

    fireEvent.click(screen.getByRole('button', { name: 'header.mute' }))

    expect(screen.getByRole('button', { name: 'header.unmute' })).toHaveAttribute('aria-pressed', 'true')
    expect(mockWriteLocal).toHaveBeenCalledWith('soundEnabled', 'false')
  })

  it('anchors the language list to its chip so the panel cannot clip it', () => {
    render(<QuickSettingsRow />)

    expect(screen.getByTestId('language-switcher')).toHaveAttribute('data-anchor', 'top end')
  })
})
