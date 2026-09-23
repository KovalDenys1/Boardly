import { MetadataRoute } from 'next'
import { socialShortLinkDisallow } from '@/lib/social-short-links'

/** Private or per-user pages no crawler has any business in. */
const PRIVATE_PATHS = [
  '/api/',
  '/auth/verify-email',
  '/auth/reset-password',
  '/profile/',    // user profiles — private content
  '/friends',     // friends list — private content
]

/**
 * Crawlers that fetch a page only to draw a link preview in a chat or a feed
 * (#1091). Twitterbot and Meta's crawlers honour robots.txt, so the blanket
 * `/lobby/` disallow below meant an invite link pasted into X, Facebook or
 * Instagram DMs got no card at all. They may read a lobby's head; search
 * engines still may not, and the lobby page is `noindex` regardless.
 */
export const LINK_PREVIEW_BOTS = [
  'Twitterbot',
  'facebookexternalhit',
  'Facebot',
  'LinkedInBot',
  'Slackbot-LinkExpanding',
  'Discordbot',
  'WhatsApp',
  'TelegramBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          ...PRIVATE_PATHS,
          '/lobby/',      // live game rooms — dynamic, not useful for search
          ...socialShortLinkDisallow(), // social short links (#1096) — redirects only
        ],
      },
      {
        userAgent: LINK_PREVIEW_BOTS,
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: 'https://boardly.online/sitemap.xml',
  }
}
