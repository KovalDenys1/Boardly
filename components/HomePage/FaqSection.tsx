'use client'

import en from '@/locales/en'
import type { FaqFacts, FaqGame } from '@/lib/faq-facts'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { useTranslation } from '@/lib/i18n-helpers'

/**
 * "A, B and C". All four locales put the conjunction in the same place and none
 * of them takes a comma before it, so one shape covers them — the word itself
 * comes from the locale file. Intl.ListFormat would do this too, but its types
 * need lib ES2021 and the project targets ES2020.
 */
function joinList(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

// The catalog's nameKey is a plain string; every value in it is a real
// translation key, which the locale-parity check enforces.
function localized(t: (key: TranslationKeys) => string, games: FaqGame[], and: string): string {
  return joinList(games.map((game) => t(game.nameKey as TranslationKeys)), and)
}

function english(games: FaqGame[]): string {
  return joinList(games.map((game) => game.nameEn), 'and')
}

// Render order. `q0` is the plain "what is this site" answer, added first for
// #886: brand searches land on the home page, and until now nothing in its
// visible text said which Boardly this is. It is q0 rather than a renumbering
// because q1–q8 are keyed in four locale files and in `answerVars` below.
const FAQ_KEYS = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const
type FaqKey = (typeof FAQ_KEYS)[number]

/**
 * The JSON-LD stays English whatever the visitor's language is, so it is built
 * from the English locale rather than kept as a second hand-written copy of the
 * answers. Keeping two copies is how q1 came to promise "no subscriptions, no
 * ads, and no paywalls" in both places long after Premium went live (#878).
 */
function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  )
}

function buildFaqJsonLd(vars: Partial<Record<FaqKey, Record<string, string | number>>>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map((key) => ({
      '@type': 'Question',
      name: en.faq[key].question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: interpolate(en.faq[key].answer, vars[key] ?? {}),
      },
    })),
  }
}

const FAQ_COLORS = [
  'var(--bd-coral)',
  'var(--bd-mint)',
  'var(--bd-sun)',
  'var(--bd-lav)',
] as const

export default function FaqSection({ facts }: { facts: FaqFacts }) {
  const { t } = useTranslation()

  // The four answers that name games or money take their values from the
  // catalog, so the copy cannot drift from what the site actually offers.
  const and = t('faq.listAnd')
  const answerVars: Partial<Record<FaqKey, Record<string, string | number>>> = {
    q1: { price: facts.premiumPrice },
    q3: { games: localized(t, facts.games, and) },
    q4: { games: localized(t, facts.botGames, and) },
    q7: { max: facts.maxPlayers, game: t(facts.maxPlayersGame.nameKey as TranslationKeys) },
  }

  const englishVars: Partial<Record<FaqKey, Record<string, string | number>>> = {
    q1: { price: facts.premiumPrice },
    q3: { games: english(facts.games) },
    q4: { games: english(facts.botGames) },
    q7: { max: facts.maxPlayers, game: facts.maxPlayersGame.nameEn },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(englishVars)) }}
      />
      <section className="home-faq-section" aria-labelledby="home-faq-title">
        <div className="home-faq-intro">
          <span className="home-faq-kicker">FAQ</span>
          <h2 id="home-faq-title">{t('faq.title')}</h2>
          <p>{t('faq.intro')}</p>
        </div>

        <dl className="home-faq-list">
          {FAQ_KEYS.map((key, index) => (
            <div key={key} className="home-faq-item">
              <dt>
                <span style={{ background: FAQ_COLORS[index % FAQ_COLORS.length] }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                {t(`faq.${key}.question`)}
              </dt>
              <dd>{t(`faq.${key}.answer`, answerVars[key])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
