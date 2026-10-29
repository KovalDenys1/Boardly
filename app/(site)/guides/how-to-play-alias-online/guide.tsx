import { Icon } from '@/components/icons'
import { GuideChecklist, GuideSection, GuideSteps, GuideTipList } from '../components/GuideLayout'
import { GuideModes } from '../components/GuideModes'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type AliasGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

function AliasGuide({ body, locale }: GuideBodyProps<AliasGuideBody>) {
  return (
    <>
      <GuideSection title={body.need.title}>
        <GuideChecklist items={body.need.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.round.title}>
        <GuideSteps steps={body.round.steps} />
      </GuideSection>

      <GuideSection title={body.cannotSay.title}>
        <div className="space-y-2">
          {body.cannotSay.rules.map(({ rule, example }) => (
            <div
              key={rule}
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
            >
              <p className="mb-0.5 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>
                <Icon name="close" size={14} tone="coral" className="mr-1" />
                {rule}
              </p>
              <p className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{example}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title={body.describers.title}>
        <GuideTipList items={body.describers.tips} />
      </GuideSection>

      <GuideSection title={body.guessers.title}>
        <GuideTipList items={body.guessers.tips} />
      </GuideSection>

      <GuideSection title={body.onBoardly.title}>
        <GuideModes modes={body.onBoardly.modes} more={body.onBoardly.more} locale={locale} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-alias-online',
  icon: { game: 'alias' },
  accentColor: 'var(--bd-coral)',
  ctaHref: '/games/alias/lobbies',
  Body: AliasGuide,
  copy: { en, ru, uk, no },
})
