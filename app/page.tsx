import Footer from '@/components/Footer'
import FaqSection from '@/components/HomePage/FaqSection'
import HeroSectionRedesign from '@/components/HomePage/HeroSectionRedesign'
import MarqueeStrip from '@/components/HomePage/MarqueeStrip'
import GameRibbon from '@/components/HomePage/GameRibbon'
import HowItWorksRedesign from '@/components/HomePage/HowItWorksRedesign'
import CtaBanner from '@/components/HomePage/CtaBanner'

// Keep home page fully static for fast global TTFB.
export const dynamic = 'force-static'
export const revalidate = 3600

export default function HomePage() {
  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: '100dvh',
        background: `
          radial-gradient(circle at 12% 8%,  rgba(255,196,77,0.18),  transparent 35%),
          radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%),
          radial-gradient(circle at 50% 100%,rgba(79,201,166,0.14),  transparent 50%),
          var(--bd-bg)
        `,
        color: 'var(--bd-ink)',
        overflowX: 'hidden',
      }}
    >
      {/* Hero */}
      <HeroSectionRedesign />

      {/* Marquee strip */}
      <MarqueeStrip />

      {/* Game ribbon */}
      <GameRibbon />

      {/* How it works */}
      <HowItWorksRedesign />

      {/* CTA banner */}
      <CtaBanner />

      {/* FAQ — kept for SEO value */}
      <div
        className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mb-8"
        style={{ color: 'var(--bd-ink)' }}
      >
        <FaqSection />
      </div>

      <Footer />
    </div>
  )
}
