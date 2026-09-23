// @ts-nocheck

/**
 * `<html lang>` has to name the language actually on screen. The root layout is
 * a server component and hardcodes `lang="en"`, so before this the whole site
 * claimed to be English no matter which of the four locales a player had
 * chosen — a screen reader then pronounces Russian with English rules and the
 * browser offers to translate a page already in the reader's language.
 */

import { render } from '@testing-library/react'
import i18n from '@/i18n'
import Providers from '@/app/providers'

jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => <>{children}</>,
  // SignupAttribution sits in the providers tree and reads the session (#1067).
  useSession: () => ({ status: 'unauthenticated', data: null }),
}))
jest.mock('@/contexts/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/GuestContext', () => ({ GuestProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/OnboardingContext', () => ({ OnboardingProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/TourContext', () => ({ TourProvider: ({ children }) => <>{children}</> }))
jest.mock('@/components/DeferredGlobalEffects', () => () => null)
jest.mock('next/dynamic', () => () => () => null)

describe('<html lang> follows the active locale', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en'
  })

  it('names the current language on mount', async () => {
    await i18n.changeLanguage('en')
    render(<Providers><div /></Providers>)

    expect(document.documentElement.lang).toBe('en')
  })

  it('follows a language change instead of staying English', async () => {
    render(<Providers><div /></Providers>)

    await i18n.changeLanguage('ru')
    expect(document.documentElement.lang).toBe('ru')

    await i18n.changeLanguage('uk')
    expect(document.documentElement.lang).toBe('uk')

    await i18n.changeLanguage('en')
  })

  it('normalises a regional tag to the locale the site actually has', async () => {
    render(<Providers><div /></Providers>)

    await i18n.changeLanguage('ru-RU')
    expect(document.documentElement.lang).toBe('ru')

    await i18n.changeLanguage('en')
  })
})
