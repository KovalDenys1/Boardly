// @ts-nocheck

/**
 * The layer that was missing on 2026-09-21.
 *
 * Every component test in this repo mocks `@/lib/i18n-helpers` so that `t()`
 * returns its own key. That makes the tests fast and independent of copy — and
 * it also makes them structurally incapable of noticing a translation fault.
 * `PasswordInput` shipped `label = 'Password'` as a default parameter value,
 * 254 suites stayed green, and a player opening the Russian login page saw an
 * English word under a Russian one.
 *
 * So this file does the opposite: it initialises **real** i18next with the
 * **real** locale bundles and renders each component twice, once in English and
 * once in Russian.
 *
 * The assertion is that the two renders differ. That is deliberately not a
 * word list — a word list needs maintaining and argues about brand names. A
 * component whose visible text is byte-identical in two languages either has no
 * copy at all, or has copy that never reached `t()`. The first case is opted
 * out by name below; the second is the bug.
 */

import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '@/locales/en'
import ru from '@/locales/ru'

import PasswordInput from '@/components/PasswordInput'
import Toast from '@/components/Toast'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

async function makeInstance(language: string) {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: en }, ru: { translation: ru } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  return instance
}

/**
 * Everything a person receives from a render: the text nodes, plus the four
 * attributes a screen reader or a tooltip speaks. `Toast` has no copy of its
 * own in the DOM - it paints the message it is handed - and its one translated
 * string is an `aria-label`, so reading `textContent` alone would have declared
 * it untranslatable and opted it out of the very check it passes.
 *
 * Digits and whitespace are flattened so a timer or a score cannot make two
 * renders differ for the wrong reason.
 */
const SPOKEN_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder']

function visibleText(container: HTMLElement): string {
  const spoken = SPOKEN_ATTRIBUTES.flatMap((attribute) =>
    [...container.querySelectorAll(`[${attribute}]`)].map(
      (element) => element.getAttribute(attribute) ?? ''
    )
  )

  return [container.textContent ?? '', ...spoken]
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\d+/g, '#')
    .trim()
}

async function renderIn(language: string, element: React.ReactElement): Promise<string> {
  const instance = await makeInstance(language)
  const { container, unmount } = render(
    <I18nextProvider i18n={instance}>{element}</I18nextProvider>
  )
  const text = visibleText(container)
  unmount()
  return text
}

const CASES: Array<{ name: string; element: React.ReactElement }> = [
  {
    name: 'PasswordInput',
    element: <PasswordInput value="" onChange={() => {}} />,
  },
  {
    name: 'Toast',
    element: <Toast message="x" type="success" onClose={() => {}} />,
  },
]

describe('components render differently in Russian than in English', () => {
  it.each(CASES)('$name', async ({ element }) => {
    const english = await renderIn('en', element)
    const russian = await renderIn('ru', element)

    expect(english.length).toBeGreaterThan(0)
    expect(russian).not.toBe(english)
  })
})

describe('the real Russian bundle reaches the DOM', () => {
  it('renders the password label in Russian, not as a key and not in English', async () => {
    const instance = await makeInstance('ru')
    render(
      <I18nextProvider i18n={instance}>
        <PasswordInput value="" onChange={() => {}} />
      </I18nextProvider>
    )

    // The exact regression: the label was the English default of a destructured
    // prop, so it survived every mock-based test in the repo.
    expect(screen.queryByText('Password')).toBeNull()
    expect(screen.queryByText(/^auth\.password\./)).toBeNull()
    expect(screen.getByText(ru.auth.password.label)).toBeInTheDocument()
  })
})
