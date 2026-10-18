import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeToggle } from '@/components/Header/ThemeToggle'

const mockApplyThemeMode = jest.fn()
let storedTheme = 'system'

jest.mock('@/lib/theme', () => ({
  THEME_STORAGE_KEY: 'theme',
  DARK_MEDIA_QUERY: '(prefers-color-scheme: dark)',
  getStoredThemeMode: () => storedTheme,
  applyThemeMode: (...args: unknown[]) => mockApplyThemeMode(...args),
}))

jest.mock('@/lib/safe-storage', () => ({
  getSafeLocalStorage: () => null,
  writeLocal: (_key: string, value: string) => {
    storedTheme = value
  },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { mode?: string }) => (options?.mode ? `${key}:${options.mode}` : key),
  }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    storedTheme = 'system'
  })

  it('names the current mode on the trigger and lists every mode by name', () => {
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'header.themeCurrent:header.themeSystem' }))

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual(['header.themeLight', 'header.themeDark', 'header.themeSystemheader.themeSystemHint'])
  })

  it('applies the chosen mode and updates the trigger label', () => {
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'header.themeCurrent:header.themeSystem' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'header.themeDark' }))

    expect(mockApplyThemeMode).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('button', { name: 'header.themeCurrent:header.themeDark' })).toBeInTheDocument()
  })
})
