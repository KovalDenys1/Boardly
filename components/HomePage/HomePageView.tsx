import Footer from '@/components/Footer'
import FaqSection from '@/components/HomePage/FaqSection'
import HeroSectionRedesign from '@/components/HomePage/HeroSectionRedesign'
import MarqueeStrip from '@/components/HomePage/MarqueeStrip'
import GameRibbon from '@/components/HomePage/GameRibbon'
import HowItWorksRedesign from '@/components/HomePage/HowItWorksRedesign'
import CtaBanner from '@/components/HomePage/CtaBanner'
import PromoVideo from '@/components/HomePage/PromoVideo'
import GuidesSection from '@/components/GuidesSection'
import { getCatalogAvailableGames, getCatalogGames, hasBotSupport } from '@/lib/game-catalog'
import { buildFaqFacts } from '@/lib/faq-facts'
import { getPremiumPricing } from '@/lib/server/premium-pricing'
import { buildPromoVideoJsonLd } from '@/lib/promo-video'
import { serverTranslator } from '@/lib/server-i18n'
import type { SeoLocale } from '@/lib/seo-locales'

function promoVideoText(locale: SeoLocale) {
  if (locale === 'en') return undefined
  const t = serverTranslator(locale)
  return { name: t('home.promoVideo.title'), description: t('home.promoVideo.label') }
}

/** The home page at / and under each language prefix; its structured data speaks the page's language. */
export default async function HomePageView({ locale }: { locale: SeoLocale }) {
  // The FAQ quotes Premium's price: take it from Stripe like /premium does
  // (#1167), refreshed with the page's hourly revalidation.
  const pricing = await getPremiumPricing()
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

      <PromoVideo />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildPromoVideoJsonLd(locale, promoVideoText(locale))) }}
      />

      {/* CTA banner */}
      <CtaBanner />

      {/* Guides — internal links to /guides/* for crawl + SEO */}
      <GuidesSection />

      {/* FAQ — kept for SEO value */}
      <div className="home-faq-wrap">
        <FaqSection facts={buildFaqFacts(pricing.monthly?.label)} />
      </div>

      <Footer listingBadge />
    </div>
  )
}
