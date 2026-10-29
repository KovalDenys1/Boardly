/**
 * @jest-environment node
 */
// #1498: a page with no reason to rank stays out of the index and out of the sitemap, so a
// crawler following the sitemap reaches only pages with substantial original text.

import type { Metadata } from 'next'
import sitemap from '@/app/sitemap'
import { metadata as withdrawalMetadata } from '@/app/(site)/withdrawal/page'
import { metadata as rulesMetadata } from '@/app/(site)/rules/page'
import { metadata as discordLinkMetadata } from '@/app/(site)/discord/link/layout'
import { metadata as suspendedMetadata } from '@/app/(site)/suspended/layout'
import { generateMetadata as profileMetadata } from '@/app/(site)/u/[publicProfileId]/page'
import { prisma } from '@/lib/db'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ prisma: { users: { findUnique: jest.fn() } } }))

const BASE = 'https://boardly.online'

const UTILITY_PAGES: Array<[string, Metadata]> = [
  ['/withdrawal', withdrawalMetadata],
  ['/rules', rulesMetadata],
  ['/discord/link', discordLinkMetadata],
  ['/suspended', suspendedMetadata],
]

describe('utility pages stay out of the index (#1498)', () => {
  it.each(UTILITY_PAGES)('%s is noindex and still lets links be followed', (_route, metadata) => {
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('leaves every utility page out of the sitemap', () => {
    const urls = sitemap().map((entry) => entry.url)
    for (const [route] of UTILITY_PAGES) expect(urls).not.toContain(`${BASE}${route}`)
  })

  it('keeps a public profile out of the index', async () => {
    ;(prisma.users.findUnique as unknown as jest.Mock).mockResolvedValue({
      username: 'Owner',
      bio: null,
      isGuest: false,
      bot: null,
      accountPreferences: { profileVisibility: 'public' },
    })
    const metadata = await profileMetadata({ params: Promise.resolve({ publicProfileId: 'AbC123xYz890' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
    expect(metadata.title).toBe("Owner's Profile")
  })
})
