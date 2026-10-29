import { GuideChecklist, GuideSection, GuideSteps, GuideTipList } from '../components/GuideLayout'
import { GuideParagraph } from '../components/GuideRich'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type SpyGuideBody } from './copy/en'

function SpyGuide({ body, locale }: GuideBodyProps<SpyGuideBody>) {
  const { setup } = body
  return (
    <>
      <GuideSection title={setup.title}>
        <GuideChecklist items={[
          { icon: 'users', text: setup.players },
          { icon: 'clock', text: setup.length },
          { icon: 'globe', text: setup.location },
          { icon: 'mask', text: setup.spy },
        ]} />
        <GuideParagraph className="mt-4 text-sm leading-relaxed" text={setup.more} locale={locale} />
      </GuideSection>

      <GuideSection title={body.round.title}>
        <GuideSteps steps={body.round.steps} />
      </GuideSection>

      <GuideSection title={body.findTheSpy.title}>
        <GuideTipList items={body.findTheSpy.tips} />
      </GuideSection>

      <GuideSection title={body.asTheSpy.title}>
        <GuideTipList items={body.asTheSpy.tips} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'how-to-play-spy-game-online',
  icon: { game: 'spy' },
  accentColor: 'var(--bd-lav)',
  ctaHref: '/games/spy/lobbies',
  Body: SpyGuide,
  copy: { en },
})
