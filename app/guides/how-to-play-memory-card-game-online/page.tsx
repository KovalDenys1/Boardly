import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Play Memory Card Game Online - Rules & Strategy Guide',
  description:
    'Learn how to play Memory card matching game online. Rules explained, difficulty levels compared, strategy tips to win, and how to play multiplayer with friends for free.',
  keywords: [
    'how to play memory card game online',
    'memory game rules',
    'memory card game strategy',
    'concentration card game how to play',
    'memory matching game tips',
    'memory game difficulty levels',
    'play memory online multiplayer',
    'memory game for beginners',
  ],
  openGraph: {
    title: 'How to Play Memory Card Game Online | Boardly',
    description: 'Complete Memory card game guide — rules, difficulty levels, strategy tips. Free multiplayer in your browser.',
    url: 'https://boardly.online/guides/how-to-play-memory-card-game-online',
    type: 'article',
  },
  alternates: {
    canonical: 'https://boardly.online/guides/how-to-play-memory-card-game-online',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Memory Card Game Online — Rules & Strategy Guide',
  description: 'Complete guide to playing Memory card matching game online — rules, difficulty levels, and strategy tips.',
  url: 'https://boardly.online/guides/how-to-play-memory-card-game-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2026-05-07',
  dateModified: '2026-05-07',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'How to Play Memory Card Game Online', item: 'https://boardly.online/guides/how-to-play-memory-card-game-online' },
  ],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is the Memory card game?',
      acceptedAnswer: { '@type': 'Answer', text: 'Memory (also called Concentration) is a card-matching game where all cards start face-down. Players take turns flipping two cards — if they match, the player keeps the pair and goes again. The player with the most pairs at the end wins.' },
    },
    {
      '@type': 'Question',
      name: 'How many players can play Memory?',
      acceptedAnswer: { '@type': 'Answer', text: 'Memory on Boardly supports 2–4 players in real-time multiplayer. All players share the same board and take turns flipping cards.' },
    },
    {
      '@type': 'Question',
      name: 'What are the difficulty levels in Memory?',
      acceptedAnswer: { '@type': 'Answer', text: 'Boardly Memory has three difficulty levels: Easy (4×4 grid, 8 pairs), Medium (4×6 grid, 12 pairs), and Hard (5×6 grid, 15 pairs). Medium is the standard competitive level for most groups.' },
    },
    {
      '@type': 'Question',
      name: 'What happens when you find a matching pair in Memory?',
      acceptedAnswer: { '@type': 'Answer', text: 'When two flipped cards match, the active player scores the pair and immediately gets another turn. Consecutive matches let you keep going until you flip a non-matching pair.' },
    },
    {
      '@type': 'Question',
      name: 'What is the best strategy for Memory?',
      acceptedAnswer: { '@type': 'Answer', text: 'The key strategy in Memory is paying attention when other players flip cards — their misses reveal card positions you can use on your turn. Scan the board systematically section by section rather than clicking randomly.' },
    },
  ],
}

export default function HowToPlayMemoryGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">

          {/* Breadcrumb */}
          <nav className="mb-6 text-white/60 text-sm flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-white transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-white">How to Play Memory Card Game</span>
          </nav>

          {/* Header */}
          <header className="mb-8 sm:mb-12">
            <div className="text-5xl sm:text-6xl mb-4">🧠</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight break-words">
              How to Play Memory Card Game Online
            </h1>
            <p className="text-white/70 text-sm">4 min read · Free to play on Boardly · 2–4 players</p>
          </header>

          {/* Intro */}
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <p className="text-white/90 leading-relaxed text-lg">
              Memory (also called Concentration) is a classic card-matching game. All cards start face-down. On your turn, flip two cards — if they match, you keep them and go again. If they don't match, both cards flip back. The player with the most matched pairs at the end wins.
            </p>
          </div>

          {/* What you need */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">What You Need</h2>
            <ul className="space-y-2 text-white/85">
              <li>✅ 2–4 players</li>
              <li>✅ A browser — desktop, tablet, or mobile</li>
              <li>✅ No account required (guest play available)</li>
              <li>✅ Free — no ads, no download</li>
            </ul>
          </section>

          {/* Rules */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">How to Play — Step by Step</h2>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Start the game', desc: 'All cards are placed face-down in a grid. The grid size depends on the difficulty level you chose.' },
                { step: '2', title: 'Flip two cards', desc: 'On your turn, click any card to reveal it, then click a second card. Both cards are visible to all players for a moment.' },
                { step: '3', title: 'Match or miss', desc: 'If the two cards show the same image, you score a pair and get another turn. If they don\'t match, both cards flip back face-down and it\'s the next player\'s turn.' },
                { step: '4', title: 'Remember positions', desc: 'This is the skill — memorize where unmatched cards are so you can complete pairs on future turns.' },
                { step: '5', title: 'Win the game', desc: 'When all pairs are found, the player with the most matches wins. Ties are possible.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">{step}</div>
                  <div>
                    <strong className="block mb-1">{title}</strong>
                    <p className="text-white/75 text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Difficulty levels */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Difficulty Levels</h2>
            <p className="text-white/80 text-sm mb-6">Boardly Memory has three difficulty levels that change the grid size and number of pairs.</p>
            <div className="space-y-4">
              {[
                { level: 'Easy', grid: '4×4', pairs: '8 pairs', best: 'Quick games, playing with younger players, or learning the game' },
                { level: 'Medium', grid: '4×6', pairs: '12 pairs', best: 'Standard competitive play — the sweet spot for most groups' },
                { level: 'Hard', grid: '5×6', pairs: '15 pairs', best: 'Serious players who want a longer, more demanding game' },
              ].map(({ level, grid, pairs, best }) => (
                <div key={level} className="border border-white/20 rounded-2xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <strong>{level}</strong>
                    <span className="text-white/60 text-sm">{grid} grid · {pairs}</span>
                  </div>
                  <p className="text-white/65 text-sm">{best}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Strategy tips */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Strategy Tips</h2>
            <ul className="space-y-4">
              {[
                { tip: 'Scan before you click', detail: 'Don\'t rush your first flip. Take a second to plan which area of the board you haven\'t explored yet. Systematic scanning beats random clicking every time.' },
                { tip: 'Use the grid like a map', detail: 'Mentally divide the grid into sections. Clear one section at a time instead of clicking randomly across the board — it\'s easier to track positions this way.' },
                { tip: 'Watch your opponents', detail: 'When other players flip cards, you see them too. Pay attention — their misses are hints about where unmatched pairs are hiding.' },
                { tip: 'Delay taking easy pairs', detail: 'Once you remember where a pair is, you don\'t have to grab it immediately. Sometimes it\'s better to flip a new unknown card first to get more information.' },
                { tip: 'Go for streaks', detail: 'Consecutive matches give you extra turns. If you\'re on a streak, prioritise pairs you\'re sure about over guesses — a missed flip ends your turn.' },
              ].map(({ tip, detail }) => (
                <li key={tip} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <strong className="block mb-1">💡 {tip}</strong>
                  <p className="text-white/75 text-sm">{detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <p className="text-white/80 mb-4">Ready to test your memory?</p>
            <Link
              href="/games/memory"
              className="inline-block px-10 py-4 bg-white text-emerald-600 rounded-2xl font-bold text-lg hover:bg-emerald-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Play Memory Now →
            </Link>
            <p className="text-white/50 text-sm mt-3">Free · No account required · 2–4 players</p>
          </div>

          {/* Related */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <h3 className="text-white/70 text-sm font-semibold mb-4 uppercase tracking-wide">More guides</h3>
            <div className="flex flex-col gap-3">
              <Link href="/guides/how-to-play-yahtzee-online" className="text-white hover:underline text-sm">→ How to Play Yahtzee Online with Friends</Link>
              <Link href="/guides/how-to-play-spy-game-online" className="text-white hover:underline text-sm">→ How to Play Guess the Spy Online</Link>
              <Link href="/guides/how-to-play-tic-tac-toe-online" className="text-white hover:underline text-sm">→ How to Play Tic Tac Toe Online</Link>
              <Link href="/guides/best-free-multiplayer-browser-games" className="text-white hover:underline text-sm">→ Best Free Multiplayer Browser Games in 2026</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
