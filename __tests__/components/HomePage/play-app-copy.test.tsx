import { render, screen } from '@testing-library/react'
import MarqueeStrip from '@/components/HomePage/MarqueeStrip'
import CtaBanner from '@/components/HomePage/CtaBanner'
import HowItWorksRedesign from '@/components/HomePage/HowItWorksRedesign'
import HeroSectionRedesign from '@/components/HomePage/HeroSectionRedesign'
import FaqSection from '@/components/HomePage/FaqSection'
import { buildFaqFacts } from '@/lib/faq-facts'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }) }))
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestName: null, setGuestMode: jest.fn(), clearGuestMode: jest.fn() }),
}))
jest.mock('@/components/HomePage/QuickPlayButton', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/HomePage/HeroBoard', () => ({ __esModule: true, default: () => null }))

const facts = { availableGameCount: 9, catalogGameCount: 14, inDevelopmentGameCount: 3, quickPlayGameCount: 7 }

function renderHome() {
  return render(
    <>
      <HeroSectionRedesign facts={facts} />
      <MarqueeStrip variant="hero" />
      <HowItWorksRedesign />
      <CtaBanner />
      <FaqSection facts={buildFaqFacts()} />
    </>
  )
}

describe('home copy in the Play app (#1491)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.appShell
  })

  it('makes no no-download or in-the-browser claim inside the installed app', () => {
    document.documentElement.dataset.appShell = 'play'
    const { container } = renderHome()
    const text = container.textContent ?? ''

    expect(text).not.toContain('home.marquee.noDownload')
    expect(text).not.toContain('home.marquee.playInBrowser')
    expect(text).not.toContain('home.statsBrowserNative')
    expect(screen.queryByText('home.heroSubtitle')).toBeNull()
    expect(screen.getByText('home.heroSubtitlePlayApp')).toBeTruthy()
    expect(screen.queryByText('home.ctaVisitorBody')).toBeNull()
    expect(screen.getByText('home.ctaVisitorBodyPlayApp')).toBeTruthy()
    expect(screen.queryByText('home.howItWorks.step3.description')).toBeNull()
    expect(screen.getByText('home.howItWorks.step3.descriptionPlayApp')).toBeTruthy()
    expect(screen.queryByText('faq.q8.question')).toBeNull()
    expect(screen.queryByText('faq.q6.question')).toBeNull()
  })

  it('keeps the no-download copy on the web', () => {
    const { container } = renderHome()
    const text = container.textContent ?? ''

    expect(text).toContain('home.marquee.noDownload')
    expect(text).toContain('home.statsBrowserNative')
    expect(screen.getByText('home.heroSubtitle')).toBeTruthy()
    expect(screen.getByText('home.ctaVisitorBody')).toBeTruthy()
    expect(screen.getByText('home.howItWorks.step3.description')).toBeTruthy()
    expect(screen.getByText('faq.q8.question')).toBeTruthy()
  })
})
