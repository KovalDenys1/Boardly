import { render } from '@testing-library/react'
import AboutPage from '@/app/(site)/about/page'
import en from '@/locales/en'
import no from '@/locales/no'

// #1498: /about was 295 words, thin for the page a reviewer reads to learn who runs the
// site. These sections say how a game works, which games have bots, how fair play and
// data are handled, and how the site is built – in every locale, not only English.

const mockI18n = { locale: 'en' as 'en' | 'no' }

jest.mock('@/lib/i18n-helpers', () => {
  const bundles = { en: require('@/locales/en').default, no: require('@/locales/no').default }
  return {
    useTranslation: () => ({
      t: (key: string) =>
        key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundles[mockI18n.locale]) ??
        key,
    }),
  }
})

jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

const SECTIONS = [
  ['howTitle', ['how1', 'how2']],
  ['botsTitle', ['bots']],
  ['fairTitle', ['fair']],
  ['dataTitle', ['data']],
  ['builtTitle', ['built']],
] as const

type AboutCopy = Record<string, string | undefined>

function pageText(locale: 'en' | 'no') {
  mockI18n.locale = locale
  const { container, unmount } = render(<AboutPage />)
  const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
  const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent)
  unmount()
  return { headings, paragraphs }
}

describe.each([
  ['en', en.about as AboutCopy],
  ['no', no.about as AboutCopy],
] as const)('/about sections in %s (#1498)', (locale, copy) => {
  it.each(SECTIONS)('renders the %s section with its own text', (titleKey, bodyKeys) => {
    const { headings, paragraphs } = pageText(locale)
    expect(copy[titleKey]).toEqual(expect.any(String))
    expect(headings).toContain(copy[titleKey])
    for (const bodyKey of bodyKeys) {
      expect(copy[bodyKey]).toEqual(expect.any(String))
      expect(paragraphs).toContain(copy[bodyKey])
    }
  })
})

describe('/about sections are translated, not copied (#1498)', () => {
  it.each(SECTIONS.flatMap(([title, bodies]) => [title, ...bodies]))('%s differs from English in Norwegian', (key) => {
    const enCopy = en.about as AboutCopy
    const noCopy = no.about as AboutCopy
    expect(noCopy[key]).toEqual(expect.any(String))
    expect(noCopy[key]).not.toBe(enCopy[key])
  })
})

describe('/about names the bot games and the games without bots (#1498)', () => {
  it('lists the seven bot games and the four conversation games', () => {
    const bots = (en.about as AboutCopy).bots ?? ''
    for (const name of ['Yahtzee', 'Tic-Tac-Toe', 'Connect Four', 'Checkers', 'Ludo', 'Memory', 'Rock Paper Scissors']) {
      expect(bots).toContain(name)
    }
    for (const name of ['Guess the Spy', 'Alias', "Liar's Party", 'Sketch & Guess']) expect(bots).toContain(name)
  })
})
