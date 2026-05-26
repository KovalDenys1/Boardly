import { MetadataRoute } from 'next'

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
    page('/', { changeFrequency: 'daily', priority: 1.0, lastModified: '2026-05-26' }),
    page('/games', { changeFrequency: 'weekly', priority: 0.9, lastModified: '2026-05-26' }),
    page('/leaderboard', { changeFrequency: 'daily', priority: 0.7, lastModified: '2026-05-26' }),

    // Game detail pages (available games only)
    page('/games/yahtzee', { changeFrequency: 'monthly', priority: 0.9, lastModified: '2026-05-01' }),
    page('/games/spy', { changeFrequency: 'monthly', priority: 0.9, lastModified: '2026-05-01' }),
    page('/games/tic-tac-toe', { changeFrequency: 'monthly', priority: 0.9, lastModified: '2026-05-01' }),
    page('/games/memory', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-05-01' }),
    page('/games/connect-four', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-05-01' }),
    page('/games/alias', { changeFrequency: 'monthly', priority: 0.85, lastModified: '2026-05-01' }),
    // rock-paper-scissors and liars-party are in-development — excluded from sitemap

    // Guides index
    page('/guides', { changeFrequency: 'weekly', priority: 0.85, lastModified: '2026-05-26' }),

    // How-to-Play guides
    page('/guides/how-to-play-yahtzee-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/how-to-play-spy-game-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/how-to-play-memory-card-game-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/how-to-play-tic-tac-toe-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/how-to-play-connect-four-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/how-to-play-alias-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),

    // Strategy guides
    page('/guides/yahtzee-strategy-guide', { changeFrequency: 'monthly', priority: 0.75, lastModified: '2026-05-26' }),
    page('/guides/connect-four-strategy-guide', { changeFrequency: 'monthly', priority: 0.75, lastModified: '2026-05-26' }),

    // Best-of guides
    page('/guides/best-free-multiplayer-browser-games', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/best-2-player-games-online', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/best-3-player-games-online', { changeFrequency: 'monthly', priority: 0.75, lastModified: '2026-05-26' }),
    page('/guides/best-online-games-for-game-night', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/best-games-to-play-on-zoom', { changeFrequency: 'monthly', priority: 0.8, lastModified: '2026-05-26' }),
    page('/guides/best-party-games-online', { changeFrequency: 'monthly', priority: 0.75, lastModified: '2026-05-26' }),

    // Legal
    page('/privacy', { changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-01-01' }),
    page('/terms', { changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-01-01' }),
  ]
}
