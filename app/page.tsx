import type { Metadata } from 'next'
import Footer from '@/components/Footer'
import FaqSection from '@/components/HomePage/FaqSection'
import HeroSectionRedesign from '@/components/HomePage/HeroSectionRedesign'
import MarqueeStrip from '@/components/HomePage/MarqueeStrip'
import GameRibbon from '@/components/HomePage/GameRibbon'
import HowItWorksRedesign from '@/components/HomePage/HowItWorksRedesign'
import CtaBanner from '@/components/HomePage/CtaBanner'
import GuidesSection from '@/components/GuidesSection'
import { getCatalogAvailableGames, getCatalogGames, hasBotSupport } from '@/lib/game-catalog'
import { buildFaqFacts } from '@/lib/faq-facts'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Keep home page fully static for fast global TTFB.
export const dynamic = 'force-static'
export const revalidate = 3600

export default function HomePage() {
  const catalogGames = getCatalogGames()
  const availableGames = getCatalogAvailableGames()
  const quickPlayGameCount = availableGames.filter((game) => game.gameType && hasBotSupport(game.gameType)).length
  // Everything that is not playable yet is "coming soon" — the same rule
  // /games uses for its badge, so the two pages count the same games (#868).
  const inDevelopmentGameCount = catalogGames.filter((game) => game.availability !== 'available').length

  return (
    <div
      className="home-page-shell flex flex-col"
      style={{
        background: 'var(--bd-bg)',
        color: 'var(--bd-ink)',
        overflowX: 'hidden',
      }}
    >
      <div className="home-first-screen">
        {/* Hero */}
        <HeroSectionRedesign
          facts={{
            availableGameCount: availableGames.length,
            // "Games in catalog" sits directly under the "N ready to play" /
            // "M more coming soon" badges — it must equal ready + coming
            // soon. Since 'planned' games count as coming soon (see above),
            // that is the whole catalog again, and the three numbers add up
            // (6 + 9 = 15).
            catalogGameCount: availableGames.length + inDevelopmentGameCount,
            inDevelopmentGameCount,
            quickPlayGameCount,
          }}
        />

        <div className="home-marquee-anchor">
          <MarqueeStrip variant="hero" />
        </div>
      </div>

      {/* Game ribbon */}
      <GameRibbon />

      {/* How it works */}
      <HowItWorksRedesign />

      {/* CTA banner */}
      <CtaBanner />

      {/* Guides — internal links to /guides/* for crawl + SEO */}
      <GuidesSection />

      {/* FAQ — kept for SEO value */}
      <div className="home-faq-wrap">
        <FaqSection facts={buildFaqFacts()} />
      </div>

      <Footer />
    </div>
  )
}
