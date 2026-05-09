import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Play Guess the Spy Online - Rules & Strategy Guide',
  description:
    'Learn how to play Guess the Spy (Spyfall) online. Rules explained, tips for finding the spy, how to survive as the spy, and how to run the perfect game night.',
  keywords: [
    'how to play guess the spy',
    'spyfall rules',
    'how to play spy game online',
    'spy game strategy',
    'social deduction game guide',
    'guess the spy tips',
    'spyfall online guide',
    'how to play spyfall',
  ],
  openGraph: {
    title: 'How to Play Guess the Spy Online | Boardly',
    description: 'Complete guide to Guess the Spy — rules, strategy for both sides, and tips for a great game night.',
    url: 'https://boardly.online/guides/how-to-play-spy-game-online',
    type: 'article',
  },
  alternates: {
    canonical: 'https://boardly.online/guides/how-to-play-spy-game-online',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Guess the Spy Online — Rules & Strategy Guide',
  description: 'Complete guide to the social deduction game Guess the Spy — rules, tips for both sides, and how to host a great game.',
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
    { '@type': 'ListItem', position: 3, name: 'How to Play Guess the Spy Online', item: 'https://boardly.online/guides/how-to-play-spy-game-online' },
  ],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Guess the Spy?',
      acceptedAnswer: { '@type': 'Answer', text: 'Guess the Spy is a social deduction party game where all players except one are told a secret location. The spy has no idea where everyone is and must bluff through questioning to survive — while the others try to identify and vote out the spy.' },
    },
    {
      '@type': 'Question',
      name: 'How many players do you need for Guess the Spy?',
      acceptedAnswer: { '@type': 'Answer', text: 'Guess the Spy works with 3–10 players. It plays best with 5–8 players, giving enough voices to make questioning interesting without becoming too chaotic.' },
    },
    {
      '@type': 'Question',
      name: 'How does the spy win in Guess the Spy?',
      acceptedAnswer: { '@type': 'Answer', text: 'The spy can win in two ways: either survive the entire round without being voted out, or correctly guess the secret location before being eliminated. A correct location guess wins the round for the spy even if they were about to be caught.' },
    },
    {
      '@type': 'Question',
      name: 'What happens if players vote out the wrong person?',
      acceptedAnswer: { '@type': 'Answer', text: 'If the majority votes to accuse someone who is not the spy, the group loses the round. The spy is immediately revealed and wins. This is why rushing the vote is risky.' },
    },
    {
      '@type': 'Question',
      name: 'How long is a round of Guess the Spy?',
      acceptedAnswer: { '@type': 'Answer', text: 'A typical round lasts 5–8 minutes. Rounds are short enough that you can easily play multiple in one session.' },
    },
  ],
}

export default function HowToPlaySpyGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="min-h-[100dvh] bg-gradient-to-br from-red-500 via-pink-600 to-purple-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">

          {/* Breadcrumb */}
          <nav className="mb-6 text-white/60 text-sm flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-white transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-white">How to Play Guess the Spy</span>
          </nav>

          {/* Header */}
          <header className="mb-8 sm:mb-12">
            <div className="text-5xl sm:text-6xl mb-4">🕵️</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight break-words">
              How to Play Guess the Spy Online
            </h1>
            <p className="text-white/70 text-sm">4 min read · Free to play on Boardly · 3–10 players</p>
          </header>

          {/* Intro */}
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <p className="text-white/90 leading-relaxed text-lg">
              Guess the Spy is a social deduction party game where one player (the spy) has no idea where everyone else is. The group asks clever questions to expose the spy, while the spy bluffs to survive and guess the location. It&apos;s one of the best online party games for groups of friends — no board needed, just sharp thinking and poker faces.
            </p>
          </div>

          {/* Setup */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Game Setup</h2>
            <ul className="space-y-2 text-white/85">
              <li>👥 <strong>3–10 players</strong> — works great at any size in this range</li>
              <li>🕐 <strong>~5–8 minutes per round</strong></li>
              <li>🌍 <strong>One secret location</strong> per round (e.g. Beach, Hospital, Space Station)</li>
              <li>🕵️ <strong>One spy</strong> — randomly assigned, hidden from other players</li>
            </ul>
          </section>

          {/* Rules */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-6">How a Round Works</h2>
            <ol className="space-y-5">
              {[
                {
                  step: '1',
                  title: 'Roles are secretly assigned',
                  detail: 'All players except the spy are shown the secret location (e.g. "Train Station"). The spy only sees "You are the spy" — they have no idea where everyone is.',
                },
                {
                  step: '2',
                  title: 'Questioning phase begins',
                  detail: 'Players take turns asking each other one question about the location. Keep questions vague enough to not give away the location to the spy, but specific enough to prove you know it.',
                },
                {
                  step: '3',
                  title: 'Anyone can call a vote',
                  detail: 'At any time, a player can call a vote to accuse someone of being the spy. If the majority agrees, the accused is revealed. Accusing the wrong person loses the round for the group.',
                },
                {
                  step: '4',
                  title: 'The spy can guess the location',
                  detail: 'Before being voted out, the spy can declare "I know the location!" and make a guess. A correct guess wins the round for the spy — even if they were about to be exposed.',
                },
              ].map(({ step, title, detail }) => (
                <li key={step} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">{step}</span>
                  <div>
                    <strong className="block mb-1">{title}</strong>
                    <p className="text-white/75 text-sm">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Tips for innocents */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Tips for Innocents — How to Find the Spy</h2>
            <ul className="space-y-4">
              {[
                { tip: 'Ask specific-but-not-obvious questions', detail: 'At a beach: "How crowded is it?" is specific enough to test the spy but doesn\'t reveal the location outright. Avoid "What do you smell?"  — too easy to bluff.' },
                { tip: 'Watch hesitation and vagueness', detail: 'Innocents answer quickly and naturally. Spies pause, use hedging words like "maybe" or "it depends," and often give oddly short answers.' },
                { tip: 'Don\'t rush the vote', detail: 'The spy wants you to vote incorrectly. Let the questioning reveal patterns before committing to a vote — a wrong vote is a loss.' },
                { tip: 'Cross-reference answers', detail: 'If two innocents give consistent answers about the same location detail and a third gives something contradictory — that\'s your spy.' },
              ].map(({ tip, detail }) => (
                <li key={tip} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <strong className="block mb-1">🔍 {tip}</strong>
                  <p className="text-white/75 text-sm">{detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Tips for spy */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Tips for the Spy — How to Survive</h2>
            <ul className="space-y-4">
              {[
                { tip: 'Give confident, vague answers', detail: 'The worst thing you can do is sound unsure. Be assertive — pick a direction and commit. "It\'s always busier than people expect" works for many locations.' },
                { tip: 'Eliminate locations fast', detail: 'Listen closely to others\' questions and answers — they\'re leaking information about the location. By round 3–4, you should be narrowing down your guesses.' },
                { tip: 'Accuse someone early', detail: 'Counterintuitive, but voting to accuse another player shifts suspicion away from you. Pick someone who\'s been quiet and call them out.' },
                { tip: 'Know when to guess', detail: 'If the vote is swinging toward you and you have a strong guess, fire early. A correct location guess wins even if you\'re caught — it\'s your trump card.' },
              ].map(({ tip, detail }) => (
                <li key={tip} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <strong className="block mb-1">🎭 {tip}</strong>
                  <p className="text-white/75 text-sm">{detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <p className="text-white/80 mb-4">Gather 3–10 friends and try it now.</p>
            <Link
              href="/lobby/create?gameType=guess_the_spy"
              className="inline-block px-10 py-4 bg-white text-red-600 rounded-2xl font-bold text-lg hover:bg-red-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Play Guess the Spy →
            </Link>
            <p className="text-white/50 text-sm mt-3">Free · No account required · 3–10 players</p>
          </div>

          {/* Related */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <h3 className="text-white/70 text-sm font-semibold mb-4 uppercase tracking-wide">More guides</h3>
            <div className="flex flex-col gap-3">
              <Link href="/guides/how-to-play-yahtzee-online" className="text-white hover:underline text-sm">→ How to Play Yahtzee Online with Friends</Link>
              <Link href="/guides/how-to-play-memory-card-game-online" className="text-white hover:underline text-sm">→ How to Play Memory Card Game Online</Link>
              <Link href="/guides/how-to-play-tic-tac-toe-online" className="text-white hover:underline text-sm">→ How to Play Tic Tac Toe Online</Link>
              <Link href="/guides/best-free-multiplayer-browser-games" className="text-white hover:underline text-sm">→ Best Free Multiplayer Browser Games in 2026</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
