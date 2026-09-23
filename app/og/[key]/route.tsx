import { ImageResponse } from 'next/og'

import { renderSocialCard } from '@/lib/social-card'
import {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  getSocialCard,
  getSocialCardKeys,
} from '@/lib/social-preview'

/**
 * Per-page link-preview image (#1091). Keys come from `lib/social-preview.ts`
 * only; the set is fixed at build time, so every card is rendered once and
 * served statically, and an unknown key is a 404 rather than a render.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return getSocialCardKeys().map((key) => ({ key }))
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const card = getSocialCard(key)
  if (!card) return new Response('Not found', { status: 404 })

  return new ImageResponse(renderSocialCard(card), {
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
    },
  })
}
