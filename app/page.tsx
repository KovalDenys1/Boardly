import Footer from '@/components/Footer'
import FaqSection from '@/components/HomePage/FaqSection'
import HeroSectionRedesign from '@/components/HomePage/HeroSectionRedesign'
import MarqueeStrip from '@/components/HomePage/MarqueeStrip'
import GameRibbon from '@/components/HomePage/GameRibbon'
import HowItWorksRedesign from '@/components/HomePage/HowItWorksRedesign'
import CtaBanner from '@/components/HomePage/CtaBanner'
import { getCatalogAvailableGames, getCatalogGames, hasBotSupport } from '@/lib/game-catalog'

// Keep home page fully static for fast global TTFB.
export const dynamic = 'force-static'
export const revalidate = 3600

export default function HomePage() {
  const catalogGames = getCatalogGames()
  const availableGames = getCatalogAvailableGames()
  const quickPlayGameCount = availableGames.filter((game) => game.gameType && hasBotSupport(game.gameType)).length
  const inDevelopmentGameCount = catalogGames.filter((game) => game.availability === 'in-development').length

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
            catalogGameCount: catalogGames.length,
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

      {/* FAQ — kept for SEO value */}
      <div className="home-faq-wrap">
        <FaqSection />
      </div>

      <Footer />
    </div>
  )
}
