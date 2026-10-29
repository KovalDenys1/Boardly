import { GuideParagraph } from '../components/GuideRich'
import { GuideChecklist, GuideSection, GuideTable, GuideTipList } from '../components/GuideLayout'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type YahtzeeGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

function YahtzeeGuide({ body, locale }: GuideBodyProps<YahtzeeGuideBody>) {
  return (
    <>
      <GuideSection title={body.need.title}>
        <GuideChecklist items={body.need.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.rules.title}>
        <GuideParagraph className="mb-3 text-sm leading-relaxed" text={body.rules.paragraphs[0]} locale={locale} />
        <GuideParagraph className="text-sm leading-relaxed" text={body.rules.paragraphs[1]} locale={locale} />
      </GuideSection>

      <GuideSection title={body.categories.title}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>{body.categories.upperTitle}</h3>
        <GuideTable rows={body.categories.upper} />
        <h3 className="mb-3 mt-6 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>{body.categories.lowerTitle}</h3>
        <GuideTable rows={body.categories.lower} />
      </GuideSection>

      <GuideSection title={body.strategy.title}>
        <GuideTipList items={body.strategy.tips} />
        <GuideParagraph className="mt-4 text-sm leading-relaxed" text={body.strategy.more} locale={locale} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-yahtzee-online',
  icon: { game: 'yahtzee' },
  accentColor: 'var(--bd-sky)',
  ctaHref: '/games/yahtzee/lobbies',
  Body: YahtzeeGuide,
  copy: { en, ru, uk, no },
})
