// The home page's promo video (#1470): one cut per language, served from the
// public Vercel Blob store `boardly-media` rather than from git or YouTube.

import type { Locale } from '@/locales/meta'
import { BOARDLY_URL, ORGANIZATION_ID } from './organization-json-ld'

/** The store's public host. `proxy.ts` allows exactly this origin in `media-src`. */
export const PROMO_VIDEO_ORIGIN = 'https://6mvdwjscvqidkqft.public.blob.vercel-storage.com'

export interface PromoVideo {
  src: string
  poster: string
}

function cut(path: string): PromoVideo {
  return {
    src: `${PROMO_VIDEO_ORIGIN}/${path}.mp4`,
    poster: `${PROMO_VIDEO_ORIGIN}/${path}.jpg`,
  }
}

const PROMO_VIDEOS: Record<Locale, PromoVideo> = {
  en: cut('promo/v2.1/en'),
  no: cut('promo/v2.1/no'),
  ru: cut('promo/v2.1/ru'),
  uk: cut('promo/v2.1/uk'),
  de: cut('promo/v2.1/de'),
  es: cut('promo/v2.1/es'),
}

export function promoVideoFor(language: string | undefined): PromoVideo {
  const base = (language ?? '').toLowerCase().split('-')[0] as Locale
  return PROMO_VIDEOS[base] ?? PROMO_VIDEOS.en
}

/** The cut the prerendered page plays: English at /, Russian or Ukrainian at /ru and /uk, named in that language. */
export function buildPromoVideoJsonLd(
  locale: 'en' | 'ru' | 'uk' = 'en',
  text: { name: string; description: string } = {
    name: 'Boardly – game night with friends, one link away',
    description:
      'A one-minute tour of Boardly: pick a game, send the link, and play board and party games with friends in the browser, with no download.',
  }
) {
  const video = PROMO_VIDEOS[locale]
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: text.name,
    description: text.description,
    thumbnailUrl: [video.poster],
    contentUrl: video.src,
    uploadDate: '2026-10-18',
    duration: 'PT1M',
    inLanguage: locale,
    publisher: { '@id': ORGANIZATION_ID },
    url: locale === 'en' ? `${BOARDLY_URL}/` : `${BOARDLY_URL}/${locale}`,
  }
}
