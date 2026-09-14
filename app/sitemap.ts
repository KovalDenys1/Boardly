import { MetadataRoute } from 'next'

import { ALL_GUIDES } from '@/lib/guides-catalog'

const BASE = 'https://boardly.online'

function page(
  path: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified: string }
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE}${path}`,
    lastModified: new Date(opts.lastModified),
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // Core pages
    page('/', { changeFrequency: 'daily', priority: 1.0, lastModified: '2026-08-29' }),
    page('/games', { changeFrequency: 'weekly', priority: 0.9, lastModified: '2026-08-29' }),
    page('/leaderboard', { changeFrequency: 'daily', priority: 0.7, lastModified: '2026-05-26' }),
    page('/about', { changeFrequency: 'yearly', priority: 0.5, lastModified: '2026-09-15' }),

    // Game detail pages (available games only)
    page('/games/yahtzee', { changeFrequency: 'monthly', priority: 0.9, lastModified: '2026-08-28' }),
    page('/games/spy', { changeFrequency: 'monthly', priority: 0.9, lastModified: '2026-05-05' }),
    page('/games/tic-tac-toe', { changeFrequency: 'monthly', priority: 0.9, lastModified: '2026-05-05' }),
    page('/games/memory', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-05-05' }),
    page('/games/connect-four', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-05-08' }),
    page('/games/alias', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-05-09' }),
    page('/games/rock-paper-scissors', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-09-09' }),
    // liars-party and sketch-and-guess are in-development — excluded from the sitemap
    // and noindex on their own pages until they are released

    // Guides index
    page('/guides', { changeFrequency: 'weekly', priority: 0.85, lastModified: '2026-05-26' }),

    // Guides — driven by lib/guides-catalog.ts so the sitemap, the guides
    // index and the on-page guide links can never disagree
    ...ALL_GUIDES.map((guide) =>
      page(`/guides/${guide.slug}`, {
        changeFrequency: 'monthly',
        priority: guide.category === 'strategy' ? 0.75 : 0.8,
        lastModified: guide.updated,
      })
    ),

    // Legal
    page('/privacy', { changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-01-01' }),
    page('/terms', { changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-01-01' }),
  ]
}
