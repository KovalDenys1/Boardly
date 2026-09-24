import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ForgetGuestButton, FORGET_GUEST_CONFIRM_WINDOW_MS } from '@/components/Header/ForgetGuestButton'
import { showToast } from '@/lib/i18n-toast'

const mockForgetGuest = jest.fn()
const mockReplace = jest.fn()

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ forgetGuest: mockForgetGuest }),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { success: jest.fn(), error: jest.fn() },
}))

describe('ForgetGuestButton (#1129)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockForgetGuest.mockResolvedValue(undefined)
  })

  it('arms on the first tap and deletes only on the second', async () => {
    render(<ForgetGuestButton />)

    fireEvent.click(screen.getByRole('button', { name: 'guest.forgetMe' }))
    expect(mockForgetGuest).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'guest.forgetMeConfirm' }))

    await waitFor(() => expect(mockForgetGuest).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(showToast.success).toHaveBeenCalledWith('guest.forgetMeDone')
  })

  it('disarms again if the second tap does not come', () => {
    jest.useFakeTimers()
    try {
      render(<ForgetGuestButton />)
      fireEvent.click(screen.getByRole('button', { name: 'guest.forgetMe' }))

      act(() => {
        jest.advanceTimersByTime(FORGET_GUEST_CONFIRM_WINDOW_MS + 1)
      })

      expect(screen.getByRole('button', { name: 'guest.forgetMe' })).toBeInTheDocument()
      expect(mockForgetGuest).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('tells a guest in a running game to leave it first', async () => {
    mockForgetGuest.mockRejectedValue(Object.assign(new Error('busy'), { code: 'GUEST_IN_ACTIVE_GAME' }))
    render(<ForgetGuestButton />)

    fireEvent.click(screen.getByRole('button', { name: 'guest.forgetMe' }))
    fireEvent.click(screen.getByRole('button', { name: 'guest.forgetMeConfirm' }))

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith('guest.forgetMeActiveGame'))
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
