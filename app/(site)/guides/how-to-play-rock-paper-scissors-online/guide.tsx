import { GuideChecklist, GuideSection, GuideSteps, GuideTipList } from '../components/GuideLayout'
import { GuideModes } from '../components/GuideModes'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type RockPaperScissorsGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

function RockPaperScissorsGuide({ body, locale }: GuideBodyProps<RockPaperScissorsGuideBody>) {
  return (
    <>
      <GuideSection title={body.need.title}>
        <GuideChecklist items={body.need.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.rules.title}>
        <GuideSteps steps={body.rules.steps} />
      </GuideSection>

      <GuideSection title={body.beats.title}>
        <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
          {body.beats.intro}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {body.beats.items.map((line) => (
            <div
              key={line}
              className="rounded-xl border px-3 py-2 text-xs font-medium"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
            >
              {line}
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title={body.strategy.title}>
        <GuideTipList items={body.strategy.tips} />
      </GuideSection>

      <GuideSection title={body.bot.title}>
        <div className="mb-5 space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
          <p>{body.bot.intro}</p>
        </div>
        <GuideTipList items={body.bot.tips} />
      </GuideSection>

      <GuideSection title={body.onBoardly.title}>
        <GuideModes
          modes={body.onBoardly.modes}
          more={body.onBoardly.more}
          locale={locale}
          linkClassName="underline transition-colors hover:text-bd-coral-text"
        />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-rock-paper-scissors-online',
  icon: { game: 'rps' },
  accentColor: 'var(--bd-lav)',
  ctaHref: '/games/rock-paper-scissors/lobbies',
  Body: RockPaperScissorsGuide,
  copy: { en, ru, uk, no },
})
