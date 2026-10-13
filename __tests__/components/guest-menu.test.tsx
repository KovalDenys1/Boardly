import { fireEvent, render, screen } from '@testing-library/react'
import { GuestMenu } from '@/components/Header/GuestMenu'

const mockReplace = jest.fn()
const mockClearGuestMode = jest.fn()
const mockForgetGuest = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ guestName: 'HostQ1383', clearGuestMode: mockClearGuestMode, forgetGuest: mockForgetGuest }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('GuestMenu', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows the guest name and opens Exit guest and Forget me', () => {
    render(<GuestMenu />)

    const trigger = screen.getByRole('button', { name: 'header.guestSession' })
    expect(trigger.textContent).toContain('HostQ1383')

    fireEvent.click(trigger)

    expect(screen.getByRole('button', { name: 'header.exitGuest' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'guest.forgetMe' })).toBeTruthy()
  })

  it('leaves guest mode and goes home', () => {
    render(<GuestMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'header.guestSession' }))

    fireEvent.click(screen.getByRole('button', { name: 'header.exitGuest' }))

    expect(mockClearGuestMode).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('keeps the panel open while Forget me waits for its second tap', () => {
    render(<GuestMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'header.guestSession' }))

    fireEvent.click(screen.getByRole('button', { name: 'guest.forgetMe' }))

    expect(screen.getByRole('button', { name: 'guest.forgetMeConfirm' })).toBeTruthy()
    expect(mockForgetGuest).not.toHaveBeenCalled()
  })
})
