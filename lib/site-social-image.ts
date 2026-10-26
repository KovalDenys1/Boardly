export const SITE_CARD_SIZE = { width: 1200, height: 630 }

const SITE_CARD_ALT = 'Boardly — Play Board Games Online with Friends'

// Named in metadata, not a file-based opengraph-image: that only reaches its own segment, and app/ has no layout.
export function siteCardImages(url: '/opengraph-image' | '/twitter-image') {
  return [{ url, ...SITE_CARD_SIZE, alt: SITE_CARD_ALT, type: 'image/png' }]
}
