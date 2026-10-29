import { GuideChecklist, GuideSection } from '../components/GuideLayout'
import { GuideGameCards } from '../components/GuideGameCards'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type GameNightGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

const GAMES = [
  { gameId: 'spy', accent: 'var(--bd-lav)', href: '/games/spy' },
  { gameId: 'alias', accent: 'var(--bd-coral)', href: '/games/alias' },
  { gameId: 'yahtzee', accent: 'var(--bd-sky)', href: '/games/yahtzee' },
  { gameId: 'memory', accent: 'var(--bd-mint)', href: '/games/memory' },
  { gameId: 'connect-four', accent: 'var(--bd-coral)', href: '/games/connect-four' },
]

function GameNightGuide({ body, locale }: GuideBodyProps<GameNightGuideBody>) {
  return (
    <>
      <GuideSection title={body.goodGame.title}>
        <GuideChecklist items={body.goodGame.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.games.title}>
        <GuideGameCards meta={GAMES} items={body.games.items} noteLabel={body.games.noteLabel} locale={locale} />
      </GuideSection>

      <GuideSection title={body.groupSizes.title}>
        <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
          {body.groupSizes.intro}
        </p>
        <div className="space-y-3">
          {body.groupSizes.sizes.map(({ size, pick, why }) => (
            <div
              key={size}
              className="rounded-2xl border p-4"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{size}</strong>
                <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{pick}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{why}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title={body.hosting.title}>
        <GuideChecklist items={body.hosting.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'best-online-games-for-game-night',
  icon: { glyph: 'party' },
  accentColor: 'var(--bd-lav)',
  ctaHref: '/games',
  Body: GameNightGuide,
  copy: { en, ru, uk, no },
})
