import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'How to Play Guess the Spy Online - Complete Guide',
  description:
    'Learn how to play Guess the Spy online. Rules, tips for finding the spy, how to survive as the spy, and how to run a great game night.',
  keywords: [
    'how to play guess the spy online',
    'spy game rules',
    'social deduction game guide',
    'spy game strategy',
    'play guess the spy with friends',
    'spy game tips',
  ],
  openGraph: {
    title: 'How to Play Guess the Spy Online | Boardly',
    description: 'Complete Guess the Spy guide — rules, tips for innocents and the spy. Free 3–10 player game in your browser.',
    url: 'https://boardly.online/guides/how-to-play-spy-game-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/how-to-play-spy-game-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Guess the Spy Online — Complete Guide',
  description: 'Rules, tips for finding the spy, and survival tips as the spy.',
  url: 'https://boardly.online/guides/how-to-play-spy-game-online',
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
    { '@type': 'ListItem', position: 3, name: 'How to Play Guess the Spy', item: 'https://boardly.online/guides/how-to-play-spy-game-online' },
  ],
}

export default function HowToPlaySpyGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🕵️"
        title="How to Play Guess the Spy Online"
        subtitle="4 min read · Free to play on Boardly · 3–10 players"
        breadcrumbLabel="How to Play Guess the Spy"
        accentColor="var(--bd-lav)"
        cta={{ href: '/games/spy/lobbies', label: 'Play Guess the Spy', detail: 'Gather 3–10 friends and try it now.' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
        ]}
      >
        <GuideSection title="Game Setup">
          <GuideChecklist items={[
            '👥 3–10 players — works great at any size in this range',
            '🕐 ~5–8 minutes per round',
            '🌍 One secret location per round (e.g. Beach, Hospital, Space Station)',
            '🕵️ One spy — randomly assigned, hidden from other players',
          ]} />
        </GuideSection>

        <GuideSection title="How a Round Works">
          <GuideSteps steps={[
            {
              title: 'Roles are secretly assigned',
              detail: 'All players except the spy are shown the secret location (e.g. "Train Station"). The spy only sees "You are the spy" — they have no idea where everyone is.',
            },
            {
              title: 'Questioning phase begins',
              detail: "Players take turns asking each other one question about the location. Keep questions vague enough not to reveal the location to the spy, but specific enough to prove you know it.",
            },
            {
              title: 'Anyone can call a vote',
              detail: 'At any time, a player can call a vote to accuse someone of being the spy. If the majority agrees, the accused is revealed. Accusing the wrong person loses the round for the group.',
            },
            {
              title: 'The spy can guess the location',
              detail: 'Before being voted out, the spy can declare "I know the location!" and make a guess. A correct guess wins the round for the spy — even if they were about to be exposed.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Tips for Non-Spy Players — How to Find the Spy">
          <GuideTipList items={[
            { emoji: '🔍', tip: 'Ask questions that test knowledge without giving the location away', detail: "At a beach: 'How crowded is it?' tests the spy but doesn't tell them where everyone is. Avoid 'What do you smell?' — too easy to fake an answer." },
            { emoji: '🔍', tip: 'Watch for hesitation and vague answers', detail: 'Players who know the location answer quickly and naturally. The spy tends to pause, give short answers, or use phrases like "it depends" and "maybe."' },
            { emoji: '🔍', tip: "Don't rush the vote", detail: 'The spy wants you to accuse the wrong person. Let a few rounds of questions reveal patterns before deciding — accusing the wrong player loses the round for your group.' },
            { emoji: '🔍', tip: 'Compare answers across players', detail: "If most players give similar answers and one gives something completely different — that's likely your spy." },
          ]} />
        </GuideSection>

        <GuideSection title="Tips for the Spy — How to Survive">
          <GuideTipList items={[
            { emoji: '🎭', tip: 'Give confident, vague answers', detail: "The worst thing you can do is sound unsure. Be assertive — 'It's always busier than people expect' works for many locations." },
            { emoji: '🎭', tip: 'Eliminate locations fast', detail: "Listen closely to others' questions and answers — they're leaking information. By round 3–4, you should be narrowing down your guesses." },
            { emoji: '🎭', tip: 'Accuse someone early', detail: 'Counterintuitive, but voting to accuse another player shifts suspicion away from you. Pick someone quiet and call them out.' },
            { emoji: '🎭', tip: 'Know when to guess', detail: "If the vote is swinging toward you and you have a strong guess, fire early. A correct location guess wins even if you're caught." },
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
