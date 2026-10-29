import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { getCatalogAvailableGames } from '@/lib/game-catalog'
import { getGuideCard } from '@/lib/guide-cards'
import { BEST_OF_GUIDES, HOW_TO_PLAY_GUIDES, type GuideEntry } from '@/lib/guides-catalog'
import { ORGANIZATION_ID } from '@/lib/organization-json-ld'
import { OG_LOCALES, languageAlternates, localizeHref, localizedPath, type SeoLocale } from '@/lib/seo-locales'
import { serverTranslator } from '@/lib/server-i18n'
import { OG_SITE_DEFAULTS, socialImages } from '@/lib/social-preview'
import { GUIDE_UI, type GuideIndexUi } from './guide-ui'

const BASE = 'https://boardly.online'

const ENGLISH_KEYWORDS = [
  'board game guides',
  'how to play board games online',
  'online board game rules',
  'board game strategy tips',
  'free multiplayer game guides',
  'boardly guides',
]

const guidedGames = new Set(HOW_TO_PLAY_GUIDES.map((guide) => guide.game))
const unguidedGames = getCatalogAvailableGames().filter((game) => !guidedGames.has(game.id) && game.route)

const urlOf = (path: string, locale: SeoLocale) => {
  const localized = localizedPath(path, locale)
  return localized === '/' ? BASE : `${BASE}${localized}`
}

export function guidesIndexMetadata(locale: SeoLocale): Metadata {
  const { index } = GUIDE_UI[locale]
  const url = urlOf('/guides', locale)
  const ogTitle = `${index.ogTitle} | Boardly`

  return {
    title: index.title,
    description: index.description,
    ...(locale === 'en' ? { keywords: ENGLISH_KEYWORDS } : {}),
    openGraph: {
      ...OG_SITE_DEFAULTS,
      ...(locale === 'en' ? {} : { locale: OG_LOCALES[locale] }),
      images: socialImages('guides'),
      title: ogTitle,
      description: index.ogDescription,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      images: socialImages('guides'),
      title: ogTitle,
      description: index.ogDescription,
    },
    alternates: { canonical: url, languages: languageAlternates('/guides') },
  }
}

function GuideCard({ guide, locale, ui }: { guide: GuideEntry; locale: SeoLocale; ui: GuideIndexUi }) {
  const { slug, icon, accent } = guide
  const { title, description, readTime } = getGuideCard(slug, locale)

  return (
    <Link
      href={localizedPath(`/guides/${slug}`, locale)}
      className="bd-card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 text-2xl shadow-[2px_2px_0_var(--bd-ink)]"
          style={{
            borderColor: 'var(--bd-ink)',
            background: `color-mix(in srgb, ${accent} 18%, var(--bd-bg2))`,
          }}
        >
          {'game' in icon ? (
            <GameIcon gameId={icon.game} accentColor={accent} size={26} variant="bare" />
          ) : (
            <Icon name={icon.glyph} size={26} style={{ color: accent }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="mb-1 text-[15px] font-bold leading-snug group-hover:text-bd-coral-text"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {title}
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span
          className="rounded-lg px-2.5 py-1 text-xs font-medium"
          style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: 'var(--bd-ink-soft)' }}
        >
          {ui.readTime(readTime)}
        </span>
        <span className="text-sm transition-colors" style={{ color: 'var(--bd-ink-muted)' }}>→</span>
      </div>
    </Link>
  )
}

function GuideGroup({ title, guides, locale, ui, className }: {
  title: string; guides: GuideEntry[]; locale: SeoLocale; ui: GuideIndexUi; className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--bd-ink-muted)' }}>
          {title}
        </h2>
        <div className="h-px flex-1" style={{ background: 'var(--bd-line)' }} />
        <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{ui.count(guides.length)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {guides.map((guide) => (
          <GuideCard key={guide.slug} guide={guide} locale={locale} ui={ui} />
        ))}
      </div>
    </section>
  )
}

/** The guides index in one language: every guide listed at its URL in that language. */
export default function GuidesIndex({ locale }: { locale: SeoLocale }) {
  const ui = GUIDE_UI[locale].index
  const t = serverTranslator(locale)
  const unguided = unguidedGames.map((game) => ({
    id: game.id,
    name: t(game.nameKey),
    href: localizeHref(game.route!.replace(/\/lobbies$/, ''), locale),
  }))

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumbs.home'), item: urlOf('/', locale) },
      { '@type': 'ListItem', position: 2, name: t('header.guides'), item: urlOf('/guides', locale) },
    ],
  }

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: ui.ogTitle,
    description: ui.ogDescription,
    url: urlOf('/guides', locale),
    publisher: { '@id': ORGANIZATION_ID },
    hasPart: [...HOW_TO_PLAY_GUIDES, ...BEST_OF_GUIDES].map(({ slug }) => ({
      '@type': 'Article',
      name: getGuideCard(slug, locale).title,
      url: urlOf(`/guides/${slug}`, locale),
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />

      <div className="bd-page bd-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">

          <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label={t('breadcrumbs.label')}>
            <Link href={localizedPath('/', locale)} className="transition-colors hover:text-bd-ink">{t('breadcrumbs.home')}</Link>
            <span>/</span>
            <span style={{ color: 'var(--bd-ink)' }}>{t('header.guides')}</span>
          </nav>

          {/* Hero */}
          <div
            className="bd-card relative mb-10 overflow-hidden p-7 sm:p-8"
            style={{ background: 'linear-gradient(120deg, var(--bd-bg) 0%, color-mix(in srgb, var(--bd-lav) 8%, var(--bd-bg)) 100%)' }}
          >
            <div className="bd-dot-grid absolute inset-0 opacity-30" />
            <div className="relative flex items-end justify-between gap-6">
              <div>
                <span className="bd-kicker mb-2 block">{t('header.guides')}</span>
                <h1
                  className="mb-2 text-[clamp(28px,3.5vw,46px)] font-extrabold leading-none tracking-tight"
                  style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
                >
                  {ui.heading}
                </h1>
                <p className="max-w-[420px] text-[14px]" style={{ color: 'var(--bd-ink-soft)' }}>
                  {ui.intro}
                </p>
              </div>
              <div className="hidden shrink-0 sm:flex sm:gap-2">
                {['yahtzee', 'spy', 'memory', 'tic-tac-toe'].map((gameId) => (
                  <span
                    key={gameId}
                    className="grid h-10 w-10 place-items-center rounded-xl border-2 shadow-[2px_2px_0_var(--bd-ink)]"
                    style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-sun)' }}
                  >
                    <GameIcon gameId={gameId} accentColor="var(--bd-ink-on-accent)" detailColor="var(--bd-sun)" size={24} variant="bare" />
                  </span>
                ))}
              </div>
            </div>
          </div>

          <GuideGroup title={ui.howToPlay} guides={HOW_TO_PLAY_GUIDES} locale={locale} ui={ui} className="mb-10" />
          <GuideGroup title={ui.bestOf} guides={BEST_OF_GUIDES} locale={locale} ui={ui} />

          <section id="guides-and-games" className="bd-card mt-10 p-6 sm:p-8">
            <h2
              className="mb-3 text-lg font-bold"
              style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
            >
              {ui.aboutTitle}
            </h2>
            <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
              {ui.about.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <p>
                {ui.unguided}{' '}
                {unguided.map((game, index) => (
                  <span key={game.id}>
                    {index > 0 && (index === unguided.length - 1 ? ui.lastSeparator : ui.listSeparator)}
                    <Link href={game.href} className="underline underline-offset-2" style={{ color: 'var(--bd-coral-text)' }}>
                      {game.name}
                    </Link>
                  </span>
                ))}
                .
              </p>
            </div>
          </section>

        </div>
      </div>
      <Footer />
    </>
  )
}
