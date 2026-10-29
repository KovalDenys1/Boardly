import { GuideChecklist, GuideSection, GuideSteps, GuideTipList } from '../components/GuideLayout'
import { GuideParagraph } from '../components/GuideRich'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type MemoryGuideBody } from './copy/en'

function MemoryGuide({ body, locale }: GuideBodyProps<MemoryGuideBody>) {
  return (
    <>
      <GuideSection title={body.need.title}>
        <GuideChecklist items={body.need.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>

      <GuideSection title={body.steps.title}>
        <GuideSteps steps={body.steps.steps} />
      </GuideSection>

      <GuideSection title={body.levels.title}>
        <GuideParagraph className="mb-4 text-sm leading-relaxed" text={body.levels.intro} locale={locale} />
        <div className="space-y-3">
          {body.levels.levels.map(({ level, size, best }) => (
            <div
              key={level}
              className="rounded-2xl border p-4"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
            >
              <div className="mb-1 flex items-center justify-between">
                <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{level}</strong>
                <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{size}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{best}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title={body.strategy.title}>
        <GuideTipList items={body.strategy.tips} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-memory-card-game-online',
  icon: { game: 'memory' },
  accentColor: 'var(--bd-mint)',
  ctaHref: '/games/memory/lobbies',
  Body: MemoryGuide,
  copy: { en },
})
