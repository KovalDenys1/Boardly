import { GuideChecklist, GuideSection } from '../components/GuideLayout'
import { GuideGameCards } from '../components/GuideGameCards'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type ZoomGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

const GAMES = [
  { gameId: 'spy', accent: 'var(--bd-lav)', href: '/games/spy' },
  { gameId: 'alias', accent: 'var(--bd-coral)', href: '/games/alias' },
  { gameId: 'yahtzee', accent: 'var(--bd-sky)', href: '/games/yahtzee' },
  { gameId: 'memory', accent: 'var(--bd-mint)', href: '/games/memory' },
  { gameId: 'tic-tac-toe', accent: 'var(--bd-coral)', href: '/games/tic-tac-toe' },
]

const paragraphClass = (index: number, count: number) =>
  index < count - 1 ? 'mb-3 text-sm leading-relaxed' : 'text-sm leading-relaxed'

function ZoomGuide({ body, locale }: GuideBodyProps<ZoomGuideBody>) {
  return (
    <>
      <GuideSection title={body.why.title}>
        {body.why.paragraphs.map((text, index) => (
          <p key={text} className={paragraphClass(index, body.why.paragraphs.length)} style={{ color: 'var(--bd-ink-soft)' }}>
            {text}
          </p>
        ))}
      </GuideSection>

      <GuideSection title={body.games.title}>
        <GuideGameCards meta={GAMES} items={body.games.items} noteLabel={body.games.noteLabel} locale={locale} />
      </GuideSection>

      <GuideSection title={body.start.title}>
        <GuideChecklist items={body.start.steps.map((text) => ({ text }))} />
      </GuideSection>

      <GuideSection title={body.windows.title}>
        {body.windows.paragraphs.map((text, index) => (
          <p key={text} className={paragraphClass(index, body.windows.paragraphs.length)} style={{ color: 'var(--bd-ink-soft)' }}>
            {text}
          </p>
        ))}
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'best-games-to-play-on-zoom',
  icon: { glyph: 'laptop' },
  accentColor: 'var(--bd-sky)',
  ctaHref: '/games',
  Body: ZoomGuide,
  copy: { en, ru, uk, no },
})
