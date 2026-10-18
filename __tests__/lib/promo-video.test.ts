import { PROMO_VIDEO_ORIGIN, buildPromoVideoJsonLd, promoVideoFor } from '@/lib/promo-video'

describe('promoVideoFor (#1470)', () => {
  it('plays English for English, including a region tag', () => {
    expect(promoVideoFor('en').src).toBe(`${PROMO_VIDEO_ORIGIN}/promo/v2/en.mp4`)
    expect(promoVideoFor('en-GB')).toEqual(promoVideoFor('en'))
  })

  it('plays English for Ukrainian, never the Russian cut', () => {
    expect(promoVideoFor('uk')).toEqual(promoVideoFor('en'))
  })

  it('plays English when the language is unknown or not set yet', () => {
    expect(promoVideoFor('de')).toEqual(promoVideoFor('en'))
    expect(promoVideoFor(undefined)).toEqual(promoVideoFor('en'))
  })

  it('serves every cut and poster from the store the CSP allows', () => {
    for (const language of ['en', 'no', 'ru', 'uk']) {
      const video = promoVideoFor(language)
      expect(video.src.startsWith(`${PROMO_VIDEO_ORIGIN}/`)).toBe(true)
      expect(video.poster.startsWith(`${PROMO_VIDEO_ORIGIN}/`)).toBe(true)
    }
  })

  it('describes the English cut in the structured data', () => {
    const jsonLd = buildPromoVideoJsonLd()
    expect(jsonLd['@type']).toBe('VideoObject')
    expect(jsonLd.contentUrl).toBe(promoVideoFor('en').src)
    expect(jsonLd.thumbnailUrl).toEqual([promoVideoFor('en').poster])
  })
})
