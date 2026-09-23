import { ImageResponse } from 'next/og'

import { NextRequest, NextResponse } from 'next/server'

import { getLobbyPreview } from '@/lib/lobby-preview'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { renderSocialCard } from '@/lib/social-card'
import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH, accentHex } from '@/lib/social-preview'

export const runtime = 'nodejs'

const limiter = rateLimit(rateLimitPresets.ogLobbyImage)

/**
 * The invite card behind `/lobby/<code>` (#1091): the game and the seat count,
 * never a username. Lives under `/og/`, not `/api/`, because robots.txt
 * disallows `/api/` and Twitterbot honours it for images.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // The card depends on the path alone, but the CDN keys its cache on the query
  // string too, so `?x=1`, `?x=2`… would each be a fresh render. Send any query
  // to the bare path, which is the one cached entry.
  const url = new URL(req.url)
  if (url.search) {
    url.search = ''
    return NextResponse.redirect(url, 308)
  }

  // Fails open like every other limiter here: without Redis it falls back to a
  // per-instance in-memory count rather than refusing the image.
  const limited = await limiter(req)
  if (limited) return limited

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
    // Unauthenticated, and every uncached code is a Prisma query plus a satori
    // render. The cache does not stop anyone walking the code space – each new
    // code misses once – so the limiter above bounds that per IP; the cache
    // absorbs the repeat fetches crawlers and chat clients make of one shared
    // link. Short, because the seat count changes as people join (#1091).
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
