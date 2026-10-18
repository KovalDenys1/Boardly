import { availableLocales } from '@/locales/meta'
import { PROMO_VIDEO_ORIGIN, buildPromoVideoJsonLd, promoVideoFor } from '@/lib/promo-video'

describe('promoVideoFor (#1470)', () => {
  it('plays each site language its own cut, including a region tag', () => {
    for (const language of availableLocales) {
      expect(promoVideoFor(language).src).toBe(`${PROMO_VIDEO_ORIGIN}/promo/v2.1/${language}.mp4`)
      expect(promoVideoFor(language).poster).toBe(`${PROMO_VIDEO_ORIGIN}/promo/v2.1/${language}.jpg`)
    }
    expect(promoVideoFor('de-AT')).toEqual(promoVideoFor('de'))
  })

  it('plays English when the language is unknown or not set yet', () => {
    expect(promoVideoFor('fr')).toEqual(promoVideoFor('en'))
    expect(promoVideoFor(undefined)).toEqual(promoVideoFor('en'))
  })

  it('serves every cut and poster from the store the CSP allows', () => {
    for (const language of availableLocales) {
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
