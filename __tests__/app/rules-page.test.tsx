import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import RulesContent from '@/app/rules/RulesContent'
import { metadata } from '@/app/rules/page'
import { COMMUNITY_RULES_BANNED, COMMUNITY_RULES_KIND, MODERATION_ACTIONS } from '@/lib/community-rules'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

// The footer reaches session and router state this page does not need.
jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => null,
}))

// Resolve keys against a real bundle, switchable per test, as the withdrawal
// page test does, so the page is rendered in English and in Norwegian.
const mockI18n = { locale: 'en' as 'en' | 'no' }

jest.mock('@/lib/i18n-helpers', () => {
  const bundles = {
    en: require('@/locales/en').default,
    no: require('@/locales/no').default,
  }
  return {
    useTranslation: () => ({
      t: (key: string) => {
        const raw = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundles[mockI18n.locale])
        return typeof raw === 'string' ? raw : key
      },
    }),
  }
})

const root = process.cwd()
const source = readFileSync(path.join(root, 'app/rules/RulesContent.tsx'), 'utf8')

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

/** Every key the page renders: the literal ones and the three lists. */
function renderedKeys(): string[] {
  const literal = [...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1])
  return [
    ...literal,
    ...COMMUNITY_RULES_KIND.map((id) => `rules.kind.${id}`),
    ...COMMUNITY_RULES_BANNED.map((id) => `rules.banned.${id}`),
    ...MODERATION_ACTIONS.map((id) => `rules.actions.${id}`),
  ]
}

describe('/rules page (#1173)', () => {
  beforeEach(() => {
    mockI18n.locale = 'en'
  })

  it('is indexable and canonical on its own URL', () => {
    expect(metadata.alternates?.canonical).toBe('https://boardly.online/rules')
    expect(metadata.robots).toMatchObject({ index: true, follow: true })
  })

  it('uses only keys that exist in all four locales, and never a fallback string', () => {
    const keys = renderedKeys()
    expect(keys.length).toBeGreaterThanOrEqual(30)
    for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
    expect(source).not.toMatch(/\bt\((['`])[^'`]+\1,\s*'/)
  })

  it('lists every rule and every moderation action, and says how to report and appeal', () => {
    render(<RulesContent />)

    const banned = within(screen.getByTestId('rules-banned')).getAllByRole('listitem')
    expect(banned.map((item) => item.textContent)).toEqual(COMMUNITY_RULES_BANNED.map((id) => en.rules.banned[id]))

    const actions = within(screen.getByTestId('rules-actions')).getAllByRole('listitem')
    expect(actions.map((item) => item.textContent)).toEqual(MODERATION_ACTIONS.map((id) => en.rules.actions[id]))

    expect(screen.getByText(en.rules.report)).toBeInTheDocument()
    // One contact address for notices and appeals (#1173 acceptance).
    for (const link of screen.getAllByRole('link', { name: SUPPORT_EMAIL })) {
      expect(link).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`)
    }
    expect(screen.getAllByRole('link', { name: SUPPORT_EMAIL })).toHaveLength(2)
    expect(screen.getByRole('link', { name: en.rules.termsLink })).toHaveAttribute('href', '/terms')
  })

  it('renders in Norwegian', () => {
    mockI18n.locale = 'no'
    render(<RulesContent />)

    expect(screen.getByTestId('rules-intro')).toHaveTextContent(no.rules.intro)
    expect(screen.getByText(no.rules.banned.harassment)).toBeInTheDocument()
    expect(screen.queryByText(en.rules.banned.harassment)).not.toBeInTheDocument()
  })

  it('names the moderation tools that exist: host removal, suspension, closure, content removal', () => {
    // The host kick only works while the game is waiting, and a kicked player
    // cannot walk back in (app/api/lobby/[code]/kick-player, #1013).
    expect(en.rules.actions.kick).toContain('before the game starts')
    expect(en.rules.actions.kick).toContain('cannot join the lobby again')
    expect(en.rules.actions.suspend).toContain('for a set time or for good')
  })

  it('uses no em dash', () => {
    for (const locale of [en, no, ru, uk]) {
      expect(JSON.stringify(locale.rules)).not.toContain('—')
    }
  })
})
