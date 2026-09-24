import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import WithdrawalContent from '@/app/withdrawal/WithdrawalContent'
import { metadata } from '@/app/withdrawal/page'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { LINK_SUPPORT_URL } from '@/lib/sold-through-link'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

// The footer reaches session and router state this page does not need.
jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => null,
}))

// Resolve keys against a real bundle, switchable per test, so the page is
// rendered once in English and once in Norwegian (§ 8 fourth paragraph:
// the information has to be given in Norwegian).
const mockI18n = { locale: 'en' as 'en' | 'no' }

jest.mock('@/lib/i18n-helpers', () => {
  const bundles = {
    en: require('@/locales/en').default,
    no: require('@/locales/no').default,
  }
  return {
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, string | number>) => {
        const raw = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundles[mockI18n.locale])
        const text = typeof raw === 'string' ? raw : key
        return vars
          ? text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
              name in vars ? String(vars[name]) : whole
            )
          : text
      },
    }),
  }
})

const root = process.cwd()
const source = readFileSync(path.join(root, 'app/withdrawal/WithdrawalContent.tsx'), 'utf8')

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

describe('/withdrawal page (#1162)', () => {
  beforeEach(() => {
    mockI18n.locale = 'en'
  })

  it('is indexable and canonical on its own URL', () => {
    expect(metadata.alternates?.canonical).toBe('https://boardly.online/withdrawal')
    expect((metadata.robots as { index?: boolean }).index).toBe(true)
    expect(metadata.description).toContain('14 days')
  })

  it('uses only translation keys that exist in all four locales, and never a fallback', () => {
    const keys = [...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1])
    expect(keys.length).toBeGreaterThan(20)
    for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
    expect(source).not.toMatch(/\bt\('[^']+',\s*'/)
  })

  it('renders the 14-day rule, the form and the support address in English', () => {
    render(<WithdrawalContent />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.withdrawal.title)
    expect(screen.getByTestId('withdrawal-intro')).toHaveTextContent(en.withdrawal.intro)

    const form = screen.getByTestId('withdrawal-form')
    expect(form).toHaveTextContent(en.withdrawal.formStatement)
    for (const key of ['formOrdered', 'formName', 'formAddress', 'formDate', 'formSignature'] as const) {
      expect(form).toHaveTextContent(en.withdrawal[key])
    }
    expect(form).toHaveTextContent(`Boardly, ${SUPPORT_EMAIL}`)

    const mailLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('mailto:'))
    expect(mailLinks.length).toBe(2)
    const prefilled = mailLinks.find((link) => link.getAttribute('href')?.includes('subject='))
    expect(prefilled?.getAttribute('href')).toContain(encodeURIComponent(en.withdrawal.emailSubject))
  })

  it('says the sale goes through Link and keeps our own refund next to Link support (#1179)', () => {
    render(<WithdrawalContent />)

    expect(screen.getByTestId('withdrawal-sold-through-link')).toHaveTextContent(en.withdrawal.soldThroughLink)
    expect(en.withdrawal.soldThroughLink).toContain('merchant of record')

    const channel = screen.getByTestId('withdrawal-link-channel')
    expect(channel).toHaveTextContent(en.withdrawal.linkBody)
    expect(en.withdrawal.linkBody).toContain('cooling off period')
    expect(en.withdrawal.linkBody).toContain('14')
    const support = screen.getByRole('link', { name: en.withdrawal.linkSupportLabel })
    expect(support).toHaveAttribute('href', LINK_SUPPORT_URL)
    expect(support).toHaveAttribute('rel', expect.stringContaining('noopener'))

    expect(screen.getByText(en.withdrawal.after3)).toBeInTheDocument()
  })

  it('renders the same page in Norwegian, with the Q-0319B wording', () => {
    mockI18n.locale = 'no'
    render(<WithdrawalContent />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(no.withdrawal.title)
    expect(no.withdrawal.title).not.toBe(en.withdrawal.title)

    const form = screen.getByTestId('withdrawal-form')
    expect(form).toHaveTextContent('Fyll ut og returner dette skjemaet dersom du ønsker å gå fra avtalen.')
    expect(form).toHaveTextContent('Avtalen ble inngått den (dato)')
    expect(form).toHaveTextContent('Forbrukerens underskrift (dersom papirskjema benyttes)')
    expect(form).not.toHaveTextContent(en.withdrawal.formStatement)
  })

  it('copies the plain-text form to the clipboard and says so', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<WithdrawalContent />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.withdrawal.copyButton }))
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain(en.withdrawal.formStatement)
    expect(text).toContain(`${en.withdrawal.formName}: ____`)
    expect(screen.getByRole('status')).toHaveTextContent(
      en.withdrawal.copied.replace('{{email}}', SUPPORT_EMAIL)
    )

    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })

  it('shows a visible message when no clipboard is available', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const execCommand = document.execCommand
    Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true })

    render(<WithdrawalContent />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.withdrawal.copyButton }))
    })

    expect(screen.getByRole('status')).toHaveTextContent(en.withdrawal.copyFailed)

    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
  })
})
