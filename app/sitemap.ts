import { MetadataRoute } from 'next'

const baseUrl = 'https://boardly.online'
const now = new Date()

function page(
  path: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified?: Date }
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${path}`,
    lastModified: opts.lastModified ?? now,
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    page('/', { changeFrequency: 'daily', priority: 1.0 }),
    page('/games', { changeFrequency: 'weekly', priority: 0.9 }),

    // Active game pages
    page('/games/yahtzee', { changeFrequency: 'monthly', priority: 0.9 }),
    page('/games/tic-tac-toe', { changeFrequency: 'monthly', priority: 0.9 }),
    page('/games/memory', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/spy', { changeFrequency: 'monthly', priority: 0.85 }),
    page('/games/alias', { changeFrequency: 'monthly', priority: 0.8 }),
    page('/games/liars-party', { changeFrequency: 'monthly', priority: 0.8 }),

    // Discovery pages
    page('/leaderboard', { changeFrequency: 'daily', priority: 0.7 }),

    // Guides
    page('/guides', { changeFrequency: 'weekly', priority: 0.8 }),
    page('/guides/how-to-play-yahtzee-online', { changeFrequency: 'monthly', priority: 0.8 }),
    page('/guides/how-to-play-spy-game-online', { changeFrequency: 'monthly', priority: 0.75 }),
    page('/guides/best-free-multiplayer-browser-games', { changeFrequency: 'monthly', priority: 0.75 }),

    // Legal
    page('/privacy', { changeFrequency: 'yearly', priority: 0.3 }),
    page('/terms', { changeFrequency: 'yearly', priority: 0.3 }),
  ]
}
