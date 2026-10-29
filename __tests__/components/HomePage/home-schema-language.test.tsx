// @ts-nocheck

/**
 * #1394: the home page's structured data speaks the language the page is
 * prerendered in – English at /, Russian at /ru, Ukrainian at /uk – so its
 * answers are the text a crawler finds on that page.
 */

import { renderToString } from 'react-dom/server'
import FaqSection from '@/components/HomePage/FaqSection'
import NoPageLocale from '@/components/i18n/NoPageLocale'
import RuPageLocale from '@/components/i18n/RuPageLocale'
import UkPageLocale from '@/components/i18n/UkPageLocale'
import { buildFaqFacts } from '@/lib/faq-facts'
import { buildPromoVideoJsonLd, promoVideoFor } from '@/lib/promo-video'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

jest.mock('@/hooks/useIsPlayApp', () => ({ useIsPlayApp: () => false }))

function faqSchema(html: string) {
  const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1] ?? ''
  return JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
}

describe('home FAQ schema language (#1394)', () => {
  const facts = buildFaqFacts('$2.99')

  it('is Russian on /ru, matching the questions the page shows', () => {
    const html = renderToString(
      <RuPageLocale>
        <FaqSection facts={facts} />
      </RuPageLocale>
    )
    const schema = faqSchema(html)
    expect(schema.mainEntity[0].name).toBe(ru.faq.q0.question)
    expect(html).toContain(ru.faq.q0.question)
    for (const entry of schema.mainEntity) expect(entry.acceptedAnswer.text).not.toMatch(/\{\{/)
  })

  it('is Ukrainian on /uk', () => {
    const html = renderToString(
      <UkPageLocale>
        <FaqSection facts={facts} />
      </UkPageLocale>
    )
    expect(faqSchema(html).mainEntity[1].name).toBe(uk.faq.q1.question)
  })

  it('is Norwegian on /no', () => {
    const html = renderToString(
      <NoPageLocale>
        <FaqSection facts={facts} />
      </NoPageLocale>
    )
    expect(faqSchema(html).mainEntity[0].name).toBe(no.faq.q0.question)
  })

  it('stays English on an unprefixed page', () => {
    expect(faqSchema(renderToString(<FaqSection facts={facts} />)).mainEntity[0].name).toBe(en.faq.q0.question)
  })
})

describe('home VideoObject language (#1394)', () => {
  it('names the cut the /ru page plays, at the /ru URL', () => {
    const video = buildPromoVideoJsonLd('ru', { name: ru.home.promoVideo.title, description: ru.home.promoVideo.label })
    expect(video).toMatchObject({
      name: ru.home.promoVideo.title,
      inLanguage: 'ru',
      contentUrl: promoVideoFor('ru').src,
      url: 'https://boardly.online/ru',
    })
  })

  it('names the Norwegian cut at the /no URL, in Bokmål', () => {
    const video = buildPromoVideoJsonLd('no', { name: no.home.promoVideo.title, description: no.home.promoVideo.label })
    expect(video).toMatchObject({
      inLanguage: 'nb',
      contentUrl: promoVideoFor('no').src,
      url: 'https://boardly.online/no',
    })
  })

  it('is unchanged on /', () => {
    expect(buildPromoVideoJsonLd()).toMatchObject({ inLanguage: 'en', contentUrl: promoVideoFor('en').src, url: 'https://boardly.online/' })
  })
})
