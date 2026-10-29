import { render, screen } from '@testing-library/react'
import { AuthGateModal } from '@/components/AuthGateModal'

jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ setGuestMode: jest.fn() }) }))

describe('AuthGateModal in a short viewport', () => {
  // At 844x390 the card is ~460 px tall: a centred, non-scrolling overlay cut its top and its Sign Up row.
  it('scrolls the overlay and centres the card only while it fits', () => {
    render(<AuthGateModal dest="/lobby/create" onClose={() => {}} />)
    const card = screen.getByRole('heading', { level: 2 }).closest('div.w-full') as HTMLElement
    const overlay = card.parentElement as HTMLElement
    expect(overlay.className).toMatch(/\boverflow-y-auto\b/)
    expect(overlay.className).toMatch(/\bitems-start\b/)
    expect(overlay.className).not.toMatch(/\bitems-center\b/)
    expect(card.className).toMatch(/\bmy-auto\b/)
  })

  it('draws the gamepad tile glyph in ink-on-accent, which stays dark on the sun fill in dark mode', () => {
    render(<AuthGateModal dest="/lobby/create" onClose={() => {}} />)
    const tile = screen.getByRole('heading', { level: 2 }).previousElementSibling as HTMLElement
    expect(tile.style.color).toBe('var(--bd-ink-on-accent)')
  })
})
