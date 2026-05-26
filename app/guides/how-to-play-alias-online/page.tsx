import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'How to Play Alias Online - Complete Guide',
  description:
    'Learn how to play Alias online with friends. Rules, how to describe words, team tips, and how to win. Free multiplayer word game in your browser.',
  keywords: [
    'how to play alias online',
    'alias game rules',
    'alias word game guide',
    'alias game tips',
    'play alias with friends online',
    'alias online free',
  ],
  openGraph: {
    title: 'How to Play Alias Online | Boardly',
    description: 'Complete Alias guide — rules, how to describe words well, and tips to help your team win. Free multiplayer in your browser.',
    url: 'https://boardly.online/guides/how-to-play-alias-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/how-to-play-alias-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Alias Online — Complete Guide',
  description: 'Rules, tips for describing words, and how to win at Alias.',
  url: 'https://boardly.online/guides/how-to-play-alias-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2026-05-26',
  dateModified: '2026-05-26',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'How to Play Alias Online', item: 'https://boardly.online/guides/how-to-play-alias-online' },
  ],
}

export default function HowToPlayAliasGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🗣️"
        title="How to Play Alias Online"
        subtitle="4 min read · Free to play on Boardly · 4–16 players"
        breadcrumbLabel="How to Play Alias Online"
        accentColor="var(--bd-coral)"
        cta={{ href: '/games/alias/lobbies', label: 'Play Alias Now', detail: 'Gather your teams and start describing.' }}
        related={[
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            '✅ 4–16 players split into 2 teams',
            '✅ A browser — desktop, tablet, or mobile',
            '✅ No account required (guest play available)',
            '✅ Free — no ads, no download',
          ]} />
        </GuideSection>

        <GuideSection title="How a Round Works">
          <GuideSteps steps={[
            {
              title: 'Teams take turns',
              detail: 'Teams alternate. At the start of each turn, one player from the active team becomes the Describer.',
            },
            {
              title: 'The Describer sees a word',
              detail: 'Only the Describer can see the word on screen. The clock starts ticking — usually 30 to 60 seconds depending on your settings.',
            },
            {
              title: 'Describe the word — without saying it',
              detail: 'Use any words, comparisons, stories, or gestures to help your team guess. The only rules: you cannot say the word itself or any part of it.',
            },
            {
              title: 'Team guesses out loud',
              detail: 'Your teammates shout their guesses. If someone gets it right, the Describer marks it correct and moves to the next word. Wrong guesses are fine — keep going.',
            },
            {
              title: 'Score and swap',
              detail: 'When the timer runs out, your team scores one point per correct word. Then the other team takes their turn with a new Describer.',
            },
            {
              title: 'First team to the point goal wins',
              detail: 'Keep playing rounds until one team hits the score limit. The team with the most points wins.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="What You Cannot Say">
          <div className="space-y-2">
            {[
              { rule: 'The word itself', example: 'Word: Elephant → cannot say "Elephant"' },
              { rule: 'Any part of the word', example: 'Word: Football → cannot say "foot" or "ball"' },
              { rule: 'Sound-alike words', example: 'Word: Knight → cannot say "night"' },
            ].map(({ rule, example }) => (
              <div
                key={rule}
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <p className="mb-0.5 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>❌ {rule}</p>
                <p className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{example}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Tips for Describers">
          <GuideTipList items={[
            {
              emoji: '🗣️',
              tip: 'Start with easy words',
              detail: 'Do not get stuck on the first hard word. Skip it and come back — collecting easy points first builds your score and your team\'s confidence.',
            },
            {
              emoji: '🗣️',
              tip: 'Use comparisons',
              detail: '"Like a car but you ride it and it has two wheels" works well. Compare the unknown thing to something your team definitely knows.',
            },
            {
              emoji: '🗣️',
              tip: 'Move fast, do not overthink',
              detail: 'The timer is your enemy. A rough description said quickly is worth more than a perfect one that takes 10 seconds to build.',
            },
            {
              emoji: '🗣️',
              tip: 'Use gestures for tricky words',
              detail: 'Gestures are allowed. If you cannot find the right words, show what you mean — mime it, point at things in the room.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Tips for the Guessing Team">
          <GuideTipList items={[
            {
              emoji: '👥',
              tip: 'Shout everything',
              detail: 'Wrong guesses do not cost points. Say whatever comes to mind — you might land on the right word by accident.',
            },
            {
              emoji: '👥',
              tip: 'Listen for clues in the description',
              detail: 'Sometimes the way a word is described tells you its category — animal, place, action. Use that to narrow down your guesses.',
            },
            {
              emoji: '👥',
              tip: 'Build on each other',
              detail: 'If a teammate guesses "bird" and the Describer reacts positively, try specific birds. Team guessing works best when players build on each other\'s ideas.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Playing on Boardly">
          <div className="space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Team setup:</strong> Split your group into 2 teams before the game. The game supports 4 to 16 players total.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Turn timer:</strong> Choose 30, 60, 90, or 120 seconds per turn depending on how fast-paced you want the game.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>No account needed:</strong> Share a lobby link — everyone joins as a guest. Works on any device.</p>
          </div>
        </GuideSection>
      </GuideLayout>
    </>
  )
}
