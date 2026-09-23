import type { Metadata } from 'next'
import { BOARDLY_URL } from '@/lib/organization-json-ld'
import { getLobbyPreview, lobbyPreviewText } from '@/lib/lobby-preview'
import { OG_SITE_DEFAULTS, SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from '@/lib/social-preview'

/**
 * The invite preview (#1091): game and seat count, never a username – see
 * lib/lobby-preview.ts. Absolute title so the root template does not append a
 * second "| Boardly" to a title that already ends in "on Boardly".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const { title, description } = lobbyPreviewText(await getLobbyPreview(code))
  const safeCode = encodeURIComponent(code)
  const image = {
    url: `/og/lobby/${safeCode}`,
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    alt: title,
    type: 'image/png',
  }

  return {
    title: { absolute: title },
    description,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      ...OG_SITE_DEFAULTS,
      title,
      description,
      url: `${BOARDLY_URL}/lobby/${safeCode}`,
      images: [image],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  // translate="no" (#772): page translators (Google Translate et al.) replace
  // React's text nodes with <font> wrappers, so React's later removeChild of
  // the original node throws NotFoundError and the game page dies — this was
  // the single largest error bucket in Sentry. In-game UI is highly dynamic
  // and the app already ships its own 4-locale i18n, so auto-translating it
  // buys nothing. Marketing pages and guides stay translatable.
  return <div translate="no" className="contents">{children}</div>
}
