import { render, screen } from '@testing-library/react'
import { AuthGateModal } from '@/components/AuthGateModal'

jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ setGuestMode: jest.fn() }) }))
jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('AuthGateModal in a short viewport', () => {
  // At 844x390 the card is ~460 px tall: a centred, non-scrolling overlay cut its top and its Sign Up row.
  it('caps the card at the viewport and scrolls inside it, so the title and Sign Up stay reachable', () => {
    render(<AuthGateModal dest="/lobby/create" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const body = screen.getByRole('heading', { level: 2 }).closest('.overflow-y-auto') as HTMLElement
    expect(dialog.className).toMatch(/max-h-\[90dvh\]/)
    expect(dialog.contains(body)).toBe(true)
    expect(body.className).toMatch(/\boverscroll-contain\b/)
    expect(body.contains(screen.getByRole('button', { name: 'header.signUp' }))).toBe(true)
  })

  it('draws the gamepad tile glyph in ink-on-accent, which stays dark on the sun fill in dark mode', () => {
    render(<AuthGateModal dest="/lobby/create" onClose={() => {}} />)
    const tile = screen.getByRole('heading', { level: 2 }).previousElementSibling as HTMLElement
    expect(tile.style.color).toBe('var(--bd-ink-on-accent)')
  })
})
