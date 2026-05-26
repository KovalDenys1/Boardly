import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideTable } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'How to Play Yahtzee Online with Friends - Complete Guide',
  description:
    'Learn how to play Yahtzee online step by step. Scoring categories explained, strategy tips for beginners and veterans, and how to start a multiplayer game instantly.',
  keywords: [
    'how to play yahtzee online',
    'yahtzee rules',
    'yahtzee scoring categories',
    'yahtzee strategy',
    'play yahtzee with friends online',
    'yahtzee multiplayer guide',
    'yahtzee for beginners',
  ],
  openGraph: {
    title: 'How to Play Yahtzee Online with Friends | Boardly',
    description: 'Complete Yahtzee guide — rules, scoring categories, strategy tips. Free multiplayer in your browser.',
    url: 'https://boardly.online/guides/how-to-play-yahtzee-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/how-to-play-yahtzee-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Yahtzee Online with Friends — Complete Guide',
  description: 'Step-by-step guide to playing Yahtzee online — rules, scoring, and strategy tips.',
  url: 'https://boardly.online/guides/how-to-play-yahtzee-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2025-01-01',
  dateModified: '2026-05-08',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'How to Play Yahtzee Online', item: 'https://boardly.online/guides/how-to-play-yahtzee-online' },
  ],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is Yahtzee?', acceptedAnswer: { '@type': 'Answer', text: 'Yahtzee is a classic dice-rolling game where players roll five dice up to three times per turn and try to score the highest by filling 15 scoring categories.' } },
    { '@type': 'Question', name: 'How many players can play Yahtzee online?', acceptedAnswer: { '@type': 'Answer', text: 'Yahtzee on Boardly supports 1–4 players. You can play solo against an AI or in real-time multiplayer with up to 3 friends.' } },
    { '@type': 'Question', name: 'What is the upper section bonus in Yahtzee?', acceptedAnswer: { '@type': 'Answer', text: 'If your combined score in the upper section totals 63 or more, you earn a 35-point bonus.' } },
    { '@type': 'Question', name: 'What is a Yahtzee?', acceptedAnswer: { '@type': 'Answer', text: 'A Yahtzee is when all five dice show the same number. It scores 50 points. Each additional Yahtzee scores a 100-point bonus.' } },
  ],
}

export default function HowToPlayYahtzeeGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <GuideLayout
        emoji="🎲"
        title="How to Play Yahtzee Online with Friends"
        subtitle="5 min read · Free to play on Boardly · 1–4 players"
        breadcrumbLabel="How to Play Yahtzee Online"
        accentColor="var(--bd-sky)"
        cta={{ href: '/games/yahtzee/lobbies', label: 'Play Yahtzee Now', detail: 'Ready to put this into practice?' }}
        related={[
          { href: '/guides/yahtzee-strategy-guide', label: 'Yahtzee Strategy Guide — How to Win More Often' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
          { href: '/guides/how-to-play-connect-four-online', label: 'How to Play Connect Four Online' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            '✅ 1–4 players (play solo against AI or with friends)',
            '✅ A browser — desktop, tablet, or mobile',
            '✅ No account required (guest play available)',
            '✅ Free — no ads, no download',
          ]} />
        </GuideSection>

        <GuideSection title="The Basic Rules">
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Each turn, you roll five dice. You may re-roll any or all of them up to two more times (three rolls total). After your rolls, you must assign your result to one of 15 scoring categories. Once a category is filled, it cannot be changed. The game ends when all 15 categories are filled by every player.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The player with the highest total score wins. A bonus of 35 points is awarded if your upper section score totals 63 or more.
          </p>
        </GuideSection>

        <GuideSection title="All 15 Scoring Categories">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>Upper Section</h3>
          <GuideTable rows={[
            { name: 'Aces (1s)', desc: 'Sum of all dice showing 1', example: '1+1+3+4+6 = 2 pts' },
            { name: 'Twos (2s)', desc: 'Sum of all dice showing 2', example: '2+2+2+4+6 = 6 pts' },
            { name: 'Threes (3s)', desc: 'Sum of all dice showing 3', example: '3+3+3+4+6 = 9 pts' },
            { name: 'Fours (4s)', desc: 'Sum of all dice showing 4', example: '4+4+4+4+6 = 16 pts' },
            { name: 'Fives (5s)', desc: 'Sum of all dice showing 5', example: '5+5+5+5+6 = 20 pts' },
            { name: 'Sixes (6s)', desc: 'Sum of all dice showing 6', example: '6+6+6+6+6 = 30 pts' },
          ]} />
          <h3 className="mb-3 mt-6 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>Lower Section</h3>
          <GuideTable rows={[
            { name: 'One Pair', desc: 'Sum of the highest pair', example: '5+5+1+2+3 = 10 pts' },
            { name: 'Two Pairs', desc: 'Sum of both pairs', example: '5+5+3+3+1 = 16 pts' },
            { name: 'Three of a Kind', desc: 'Sum of all 5 dice', example: '3+3+3+5+6 = 20 pts' },
            { name: 'Four of a Kind', desc: 'Sum of all 5 dice', example: '4+4+4+4+2 = 18 pts' },
            { name: 'Full House', desc: 'Three of one + two of another', example: '25 pts fixed' },
            { name: 'Small Straight', desc: '4 sequential dice', example: '30 pts fixed' },
            { name: 'Large Straight', desc: '5 sequential dice', example: '40 pts fixed' },
            { name: 'Yahtzee!', desc: 'All five dice the same', example: '50 pts (100 bonus extra)' },
            { name: 'Chance', desc: 'Any combo — sum of all 5 dice', example: 'Useful as a dump' },
          ]} />
        </GuideSection>

        <GuideSection title="Strategy Tips">
          <GuideTipList items={[
            { emoji: '💡', tip: 'Chase the upper section bonus', detail: 'Aim for at least 3 of each number in the upper section — that gets you to 63 points and the 35-point bonus.' },
            { emoji: '💡', tip: 'Keep Yahtzee attempts alive', detail: "If you have 3 or 4 of the same number on your first roll, it's usually worth going for Yahtzee rather than settling for three-of-a-kind." },
            { emoji: '💡', tip: 'Use Chance as a last resort', detail: 'Chance scores the sum of all dice — save it for turns where nothing else fits. A good Chance score is usually 20+.' },
            { emoji: '💡', tip: 'Fill low-value categories early', detail: "If you roll a bad set, put zeros in Aces or Twos early — they're worth little anyway." },
            { emoji: '💡', tip: 'Prioritize Large Straight over Small', detail: 'Large Straight scores 40 vs 30 for Small. If you have 4 sequential dice after roll 1, go for the large.' },
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
