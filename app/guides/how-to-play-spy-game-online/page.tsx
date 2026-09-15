import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps, GuideFaqList, buildGuideFaqJsonLd, type GuideFaqItem } from '../components/GuideLayout'
import { getGuideBySlug } from '@/lib/guides-catalog'

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
  dateModified: getGuideBySlug('how-to-play-spy-game-online').updated,
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

/**
 * Rendered by `GuideFaqList` below and fed to the FAQPage schema from the same
 * array (#964), so the markup can never describe a question the page does not
 * show.
 */
const faq: GuideFaqItem[] = [
  {
    question: 'How many people do I need?',
    answer: 'Three at the minimum and ten at the most. Three is tighter than it sounds, because there is nowhere for the spy to hide behind other people, and five or six is where the bluffing gets interesting.',
  },
  {
    question: 'Can I play with a bot instead of a person?',
    answer: 'No, and that is deliberate. The whole game is people reading each other – a bot asking a canned question tells you nothing, and a bot holding the spy role would empty the round. Invite a third person instead.',
  },
  {
    question: 'What happens if the group accuses the wrong player?',
    answer: 'The round goes to the spy, and so does a tied vote, which eliminates nobody. That is the cost that keeps the questioning honest: a group that accuses on a hunch loses as surely as one that never accuses at all.',
  },
  {
    question: 'Can the spy win after being suspected?',
    answer: 'Yes, but only while the questions are still running. The spy names the location from the list, and a correct guess takes the round however the table was leaning. It is a real bet: a wrong guess ends the round for the group there and then, and once somebody opens the vote the guess is no longer available at all.',
  },
  {
    question: 'How specific should my questions be?',
    answer: 'Specific enough that a person who knows the location can answer naturally, vague enough that a person who does not cannot work it out from the question. That tension is the entire skill of the game.',
  },
  {
    question: 'How long is a round?',
    answer: 'Five to eight minutes, which is short enough to play several in a row. Rotating who the spy is across a few rounds is the usual way to play, and it is also how a quiet player stops looking suspicious by default.',
  },
]

const faqJsonLd = buildGuideFaqJsonLd(faq)

export default function HowToPlaySpyGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <GuideLayout
        icon={{ game: 'spy' }}
        slug="how-to-play-spy-game-online"
        title="How to Play Guess the Spy Online"
        subtitle="5 min read · Free to play on Boardly · 3–10 players"
        question="How do you play Guess the Spy online?"
        answer="Everyone but one player is shown the same secret location, and the group asks each other questions until it can vote out the player who does not know it – while the spy listens for the answer and can win outright by naming the location first."
        breadcrumbLabel="How to Play Guess the Spy"
        accentColor="var(--bd-lav)"
        cta={{ href: '/games/spy/lobbies', label: 'Play Guess the Spy', detail: 'Gather 3–10 friends and try it now.' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/how-to-play-alias-online', label: 'How to Play Alias Online' },
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
        ]}
      >
        <GuideSection title="Game Setup">
          <GuideChecklist items={[
            { icon: 'users', text: '3–10 players — works great at any size in this range' },
            { icon: 'clock', text: '~5–8 minutes per round' },
            { icon: 'globe', text: 'One secret location per round (e.g. Beach, Hospital, Space Station)' },
            { icon: 'mask', text: 'One spy — randomly assigned, hidden from other players' },
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
              detail: 'Any player can close the questions and open the vote. Everyone votes at once, and the player with the most votes is revealed – a tie eliminates nobody. Naming anyone but the spy loses the round for the group.',
            },
            {
              title: 'The spy can guess the location',
              detail: 'While the questions are still running, the spy can declare "I know the location!" and pick it from the list. A correct guess wins the round outright; a wrong one ends the round for the group. Once the vote is open the guess is gone.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Tips for Non-Spy Players — How to Find the Spy">
          <GuideTipList items={[
            { tip: 'Ask questions that test knowledge without giving the location away', detail: "At a beach: 'How crowded is it?' tests the spy but doesn't tell them where everyone is. Avoid 'What do you smell?' — too easy to fake an answer." },
            { tip: 'Watch for hesitation and vague answers', detail: 'Players who know the location answer quickly and naturally. The spy tends to pause, give short answers, or use phrases like "it depends" and "maybe."' },
            { tip: "Don't rush the vote", detail: 'The spy wants you to accuse the wrong person. Let a few rounds of questions reveal patterns before deciding — accusing the wrong player loses the round for your group.' },
            { tip: 'Compare answers across players', detail: "If most players give similar answers and one gives something completely different — that's likely your spy." },
          ]} />
        </GuideSection>

        <GuideSection title="Tips for the Spy — How to Survive">
          <GuideTipList items={[
            { tip: 'Give confident, vague answers', detail: "The worst thing you can do is sound unsure. Be assertive — 'It's always busier than people expect' works for many locations." },
            { tip: 'Eliminate locations fast', detail: "Listen closely to others' questions and answers — they're leaking information. By round 3–4, you should be narrowing down your guesses." },
            { tip: 'Accuse someone early', detail: 'Counterintuitive, but voting to accuse another player shifts suspicion away from you. Pick someone quiet and call them out.' },
            { tip: 'Know when to guess', detail: "Your window closes the moment somebody opens the vote, so name the location while the questions are still running. Guess right and the round is yours whatever the table thought; guess wrong and you hand it to them." },
          ]} />
        </GuideSection>

        <GuideSection title="Guess the Spy Questions">
          <GuideFaqList items={faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
