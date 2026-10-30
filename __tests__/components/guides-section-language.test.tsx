import { render, screen } from '@testing-library/react'
import GuidesSection from '@/components/GuidesSection'
import DePageLocale from '@/components/i18n/DePageLocale'
import EsPageLocale from '@/components/i18n/EsPageLocale'
import NoPageLocale from '@/components/i18n/NoPageLocale'
import { getGuideCard } from '@/lib/guide-cards'
import { ALL_GUIDES } from '@/lib/guides-catalog'
import de from '@/locales/de'

/**
 * #1610: the home page's guide strip on /de and /es. The guides are written in English, Russian,
 * Ukrainian and Norwegian only (#1583), so a German or Spanish page lists the English guides at
 * their English URLs, under its own heading.
 */
describe('the guide strip on a German or Spanish page (#1610)', () => {
  const hrefs = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))

  it.each([
    ['de', DePageLocale],
    ['es', EsPageLocale],
  ] as const)('lists the English guides at their English URLs on /%s', (_locale, LocaleProvider) => {
    const { container } = render(
      <LocaleProvider>
        <GuidesSection />
      </LocaleProvider>
    )

    expect(hrefs(container)).toEqual(['/guides', ...ALL_GUIDES.map((guide) => `/guides/${guide.slug}`)])
    for (const guide of ALL_GUIDES) expect(container.textContent).toContain(getGuideCard(guide.slug, 'en').title)
  })

  it('keeps the strip heading in the page language', () => {
    render(
      <DePageLocale>
        <GuidesSection />
      </DePageLocale>
    )
    expect(screen.getByRole('heading', { name: de.home.guidesTitle })).toBeInTheDocument()
  })

  it('still lists the Norwegian guides on /no', () => {
    const { container } = render(
      <NoPageLocale>
        <GuidesSection />
      </NoPageLocale>
    )
    expect(hrefs(container)).toContain(`/no/guides/${ALL_GUIDES[0].slug}`)
    expect(container.textContent).toContain(getGuideCard(ALL_GUIDES[0].slug, 'no').title)
  })
})
