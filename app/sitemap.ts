import { MetadataRoute } from 'next'

import { ALL_GUIDES } from '@/lib/guides-catalog'
import { getRouteUpdated, type DatedRoute } from '@/lib/route-dates'
import { isLocalizedPage, languageAlternates } from '@/lib/seo-locales'

const BASE = 'https://boardly.online'

type ChangeFrequency = MetadataRoute.Sitemap[number]['changeFrequency']

// lastModified comes from lib/route-dates.ts (one place to bump), never from
// a string typed here (#922).
function page(
  path: DatedRoute,
  opts: { changeFrequency: ChangeFrequency; priority: number }
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE}${path}`,
    lastModified: new Date(getRouteUpdated(path)),
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
  }
}

// A page with /ru and /uk versions is listed three times, each entry naming all three (#1394).
function withLanguageVersions(entry: MetadataRoute.Sitemap[number]): MetadataRoute.Sitemap {
  const path = entry.url.slice(BASE.length) || '/'
  if (!isLocalizedPage(path)) return [entry]
  const languages = languageAlternates(path)
  return [languages.en, languages.ru, languages.uk].map((url) => ({ ...entry, url, alternates: { languages } }))
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = [
    // Core pages
    page('/', { changeFrequency: 'daily', priority: 1.0 }),
    page('/games', { changeFrequency: 'weekly', priority: 0.9 }),
    // /leaderboard is noindex while the board is nearly empty (#1234).
    page('/about', { changeFrequency: 'yearly', priority: 0.5 }),
    page('/premium', { changeFrequency: 'monthly', priority: 0.7 }),

    // Game detail pages (available games only)
    page('/games/yahtzee', { changeFrequency: 'monthly', priority: 0.9 }),
    page('/games/spy', { changeFrequency: 'monthly', priority: 0.9 }),
    page('/games/tic-tac-toe', { changeFrequency: 'monthly', priority: 0.9 }),
    page('/games/memory', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/connect-four', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/alias', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/rock-paper-scissors', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/liars-party', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/sketch-and-guess', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/checkers', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/ludo', { changeFrequency: 'monthly', priority: 0.85 }),

    // Guides index
    page('/guides', { changeFrequency: 'weekly', priority: 0.85 }),

    // Guides – driven by lib/guides-catalog.ts so the sitemap, the guides
    // index and the on-page guide links can never disagree; lastModified is
    // the guide's own `updated`
    ...ALL_GUIDES.map((guide) => ({
      url: `${BASE}/guides/${guide.slug}`,
      lastModified: new Date(guide.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),

    // /privacy and /terms are noindex (#1227): they carry the owner's name and home address,
    // which the law requires on the site but not in search results. /withdrawal and /rules
    // are noindex too (#1498): a legal form and a copy of two sections of /terms.
  ]
  return pages.flatMap(withLanguageVersions)
}
