import { ImageResponse } from 'next/og'

import { getLobbyPreview } from '@/lib/lobby-preview'
import { renderSocialCard } from '@/lib/social-card'
import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH, accentHex } from '@/lib/social-preview'

export const runtime = 'nodejs'

/**
 * The invite card behind `/lobby/<code>` (#1091): the game and the seat count,
 * never a username. Lives under `/og/`, not `/api/`, because robots.txt
 * disallows `/api/` and Twitterbot honours it for images.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const preview = await getLobbyPreview(code)

  const card = preview.found
    ? {
        eyebrow: "You're invited",
        title: `Join my game of ${preview.gameName}`,
        subtitle: 'Tap the link to take a seat. Free, in your browser, no signup.',
        accent: accentHex(preview.accentColor ?? undefined),
        chips: [`${preview.players}/${preview.maxPlayers} players`, 'Real time', 'No download'],
      }
    : {
        eyebrow: "You're invited",
        title: 'Join a game on Boardly',
        subtitle: 'Free online board games with friends. No download, no signup.',
        accent: accentHex(undefined),
        chips: ['Free', 'Real time', 'No download'],
      }

  return new ImageResponse(renderSocialCard(card), {
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    // Unauthenticated, and every distinct 4-digit code is a fresh Prisma query
    // plus a full satori render on the nodejs runtime. Without caching the
    // whole keyspace can be walked for compute cost (#805). Link previews are
    // fetched repeatedly by crawlers and chat clients, so this also removes
    // most of the real traffic.
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
