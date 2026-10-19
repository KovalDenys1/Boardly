import { act, render, screen } from '@testing-library/react'
import i18n, { changeLanguageLazy } from '@/i18n'
import CelebrationBanner from '@/components/CelebrationBanner'
import { detectCelebration, detectPatternOnRoll } from '@/lib/celebrations'

describe('CelebrationBanner language (#1481)', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('titles a Large Straight in Spanish when the site is in Spanish', async () => {
    await act(async () => {
      await changeLanguageLazy('es')
    })

    render(
      <CelebrationBanner event={detectCelebration([2, 3, 4, 5, 6], 'largeStraight', 40)} onComplete={() => {}} />
    )

    expect(screen.getByText('¡Escalera larga! ¡Cinco seguidos!')).toBeTruthy()
    expect(screen.queryByText('Large Straight!')).toBeNull()
  })

  it.each(['ru', 'de', 'uk', 'no'] as const)('titles every celebration from the locale file in %s', async (locale) => {
    await act(async () => {
      await changeLanguageLazy(locale)
    })

    const events = [
      detectCelebration([4, 4, 4, 4, 4], 'yahtzee', 50),
      detectCelebration([1, 2, 3, 4, 5], 'largeStraight', 40),
      detectCelebration([2, 2, 3, 3, 3], 'fullHouse', 25),
      detectCelebration([6, 6, 6, 5, 5], 'chance', 30),
      detectPatternOnRoll([5, 5, 5, 5, 1]),
    ]

    for (const event of events) {
      const { container, unmount } = render(<CelebrationBanner event={event} onComplete={() => {}} />)
      const title = container.querySelector('h3')?.textContent ?? ''
      expect(title).not.toBe(event?.title)
      expect(title).not.toMatch(/^yahtzee\./)
      unmount()
    }
  })
})
