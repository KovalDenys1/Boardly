import { Icon } from '@/components/icons'
import { GuideChecklist, GuideSection, GuideSteps, GuideTipList } from '../components/GuideLayout'
import { GuideModes } from '../components/GuideModes'
import { GuideParagraph } from '../components/GuideRich'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type ConnectFourGuideBody } from './copy/en'

const DIRECTION_ROTATIONS = [0, 90, 45, 135]

function ConnectFourGuide({ body, locale }: GuideBodyProps<ConnectFourGuideBody>) {
  return (
    <>
      <GuideSection title={body.need.title}>
        <GuideChecklist items={body.need.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.rules.title}>
        <GuideSteps steps={body.rules.steps} />
      </GuideSection>

      <GuideSection title={body.directions.title}>
        <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
          {body.directions.intro}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {body.directions.items.map((label, index) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
            >
              <Icon name="arrow-right" size={16} weight="bold" style={{ transform: `rotate(${DIRECTION_ROTATIONS[index]}deg)` }} />
              {label}
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title={body.strategy.title}>
        <GuideTipList items={body.strategy.tips} />
        <GuideParagraph className="mt-4 text-sm leading-relaxed" text={body.strategy.more} locale={locale} />
      </GuideSection>

      <GuideSection title={body.onBoardly.title}>
        <GuideModes modes={body.onBoardly.modes} more={body.onBoardly.more} locale={locale} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-connect-four-online',
  icon: { game: 'connect-four' },
  accentColor: 'var(--bd-sun)',
  ctaHref: '/games/connect-four/lobbies',
  Body: ConnectFourGuide,
  copy: { en },
})
