import { GuideChecklist, GuideSection, GuideSteps, GuideTipList } from '../components/GuideLayout'
import { GuideModes } from '../components/GuideModes'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type TicTacToeGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

function TicTacToeGuide({ body, locale }: GuideBodyProps<TicTacToeGuideBody>) {
  return (
    <>
      <GuideSection title={body.need.title}>
        <GuideChecklist items={body.need.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.rules.title}>
        <GuideSteps steps={body.rules.steps} />
      </GuideSection>

      <GuideSection title={body.lines.title}>
        <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
          {body.lines.intro}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {body.lines.items.map((line) => (
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

      <GuideSection title={body.onBoardly.title}>
        <GuideModes modes={body.onBoardly.modes} more={body.onBoardly.more} locale={locale} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-tic-tac-toe-online',
  icon: { game: 'tic-tac-toe' },
  accentColor: 'var(--bd-coral)',
  ctaHref: '/games/tic-tac-toe/lobbies',
  Body: TicTacToeGuide,
  copy: { en, ru, uk, no },
})
