import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/verify-email', '/auth/reset-password'],
      },
    ],
    sitemap: 'https://boardly.online/sitemap.xml',
  }
}
