import type { Metadata } from 'next'
import Link from 'next/link'

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
  alternates: {
    canonical: 'https://boardly.online/guides/how-to-play-yahtzee-online',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Yahtzee Online with Friends — Complete Guide',
  description: 'Step-by-step guide to playing Yahtzee online — rules, scoring, and strategy tips.',
  url: 'https://boardly.online/guides/how-to-play-yahtzee-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2025-01-01',
  dateModified: '2026-04-22',
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

export default function HowToPlayYahtzeeGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <div className="min-h-[100dvh] bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">

          {/* Breadcrumb */}
          <nav className="mb-6 text-white/60 text-sm flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-white transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-white">How to Play Yahtzee Online</span>
          </nav>

          {/* Header */}
          <header className="mb-8 sm:mb-12">
            <div className="text-5xl sm:text-6xl mb-4">🎲</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight break-words">
              How to Play Yahtzee Online with Friends
            </h1>
            <p className="text-white/70 text-sm">5 min read · Free to play on Boardly</p>
          </header>

          {/* Intro */}
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <p className="text-white/90 leading-relaxed text-lg">
              Yahtzee is one of the most popular dice games in the world — and on Boardly, you can play it online with friends in real-time, completely free. This guide covers everything you need to know: the rules, all 13 scoring categories, and tips to improve your strategy.
            </p>
          </div>

          {/* What you need */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">What You Need</h2>
            <ul className="space-y-2 text-white/85">
              <li>✅ 1–4 players (play solo against AI or with friends)</li>
              <li>✅ A browser — desktop, tablet, or mobile</li>
              <li>✅ No account required (guest play available)</li>
              <li>✅ Free — no ads, no download</li>
            </ul>
          </section>

          {/* Basic rules */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">The Basic Rules</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Each turn, you roll five dice. You may re-roll any or all of them up to two more times (three rolls total). After your rolls, you must assign your result to one of 13 scoring categories. Once a category is filled, it cannot be changed. The game ends when all 13 categories are filled by every player.
            </p>
            <p className="text-white/85 leading-relaxed">
              The player with the highest total score wins. A bonus of 35 points is awarded if your upper section score (Aces through Sixes) totals 63 or more.
            </p>
          </section>

          {/* Scoring categories */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-6">All 13 Scoring Categories</h2>

            <h3 className="text-lg font-semibold mb-3 text-white/90">Upper Section</h3>
            <div className="space-y-3 mb-6">
              {[
                { name: 'Aces (1s)', desc: 'Sum of all dice showing 1', example: '1+1+3+4+6 = 2 pts' },
                { name: 'Twos (2s)', desc: 'Sum of all dice showing 2', example: '2+2+2+4+6 = 6 pts' },
                { name: 'Threes (3s)', desc: 'Sum of all dice showing 3', example: '3+3+3+4+6 = 9 pts' },
                { name: 'Fours (4s)', desc: 'Sum of all dice showing 4', example: '4+4+4+4+6 = 16 pts' },
                { name: 'Fives (5s)', desc: 'Sum of all dice showing 5', example: '5+5+5+5+6 = 20 pts' },
                { name: 'Sixes (6s)', desc: 'Sum of all dice showing 6', example: '6+6+6+6+6 = 30 pts' },
              ].map(({ name, desc, example }) => (
                <div key={name} className="flex justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                  <div>
                    <strong className="text-sm">{name}</strong>
                    <p className="text-white/65 text-xs">{desc}</p>
                  </div>
                  <span className="text-white/50 text-xs shrink-0 self-center">{example}</span>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-semibold mb-3 text-white/90">Lower Section</h3>
            <div className="space-y-3">
              {[
                { name: 'Three of a Kind', desc: 'At least 3 identical dice — score is sum of all 5 dice', example: 'e.g. 3+3+3+5+6 = 20 pts' },
                { name: 'Four of a Kind', desc: 'At least 4 identical dice — score is sum of all 5 dice', example: 'e.g. 4+4+4+4+2 = 18 pts' },
                { name: 'Full House', desc: 'Three of one number + two of another', example: '25 pts fixed' },
                { name: 'Small Straight', desc: 'Four sequential dice (e.g. 1-2-3-4 or 3-4-5-6)', example: '30 pts fixed' },
                { name: 'Large Straight', desc: 'Five sequential dice (1-2-3-4-5 or 2-3-4-5-6)', example: '40 pts fixed' },
                { name: 'Yahtzee!', desc: 'All five dice the same', example: '50 pts (100 bonus for extra)' },
                { name: 'Chance', desc: 'Any combination — score is sum of all 5 dice', example: 'Useful as a dump' },
              ].map(({ name, desc, example }) => (
                <div key={name} className="flex justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                  <div>
                    <strong className="text-sm">{name}</strong>
                    <p className="text-white/65 text-xs">{desc}</p>
                  </div>
                  <span className="text-white/50 text-xs shrink-0 self-center">{example}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Strategy tips */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Strategy Tips</h2>
            <ul className="space-y-4">
              {[
                { tip: 'Chase the upper section bonus', detail: 'Aim for at least 3 of each number in the upper section — that gets you to 63 points and the 35-point bonus, which is huge.' },
                { tip: 'Keep Yahtzee attempts alive', detail: 'If you have 3 or 4 of the same number on your first roll, it\'s usually worth going for the Yahtzee rather than settling for three-of-a-kind.' },
                { tip: 'Use Chance as a last resort', detail: 'Chance scores the sum of all dice — save it for turns where nothing else fits. A good Chance score is usually 20+.' },
                { tip: 'Fill low-value categories early', detail: 'If you roll a bad set and have already filled high-value categories, put zeros in Aces or Twos early — they\'re worth little anyway.' },
                { tip: 'Prioritize Large Straight over Small', detail: 'Large Straight scores 40 vs 30 for Small. If you have 4 sequential dice after roll 1, go for the large.' },
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
            <p className="text-white/80 mb-4">Ready to put this into practice?</p>
            <Link
              href="/lobby/create?gameType=yahtzee"
              className="inline-block px-10 py-4 bg-white text-blue-600 rounded-2xl font-bold text-lg hover:bg-blue-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Play Yahtzee Now →
            </Link>
            <p className="text-white/50 text-sm mt-3">Free · No account required · 1–4 players</p>
          </div>

          {/* Related */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <h3 className="text-white/70 text-sm font-semibold mb-4 uppercase tracking-wide">More guides</h3>
            <div className="flex flex-col gap-3">
              <Link href="/guides/how-to-play-spy-game-online" className="text-white hover:underline text-sm">→ How to Play Guess the Spy Online</Link>
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
