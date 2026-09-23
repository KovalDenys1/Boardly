import { MetadataRoute } from 'next'
import { socialShortLinkDisallow } from '@/lib/social-short-links'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/verify-email',
          '/auth/reset-password',
          '/lobby/',      // live game rooms — dynamic, not useful for search
          '/profile/',    // user profiles — private content
          '/friends',     // friends list — private content
          ...socialShortLinkDisallow(), // social short links (#1096) — redirects only
        ],
      },
    ],
    sitemap: 'https://boardly.online/sitemap.xml',
  }
}
