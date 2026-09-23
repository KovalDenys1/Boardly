import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@/i18n'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'

/**
 * #1091: Google refuses OAuth inside Instagram/TikTok/Facebook webviews, so the sign-in
 * forms say so there – and only there.
 */
describe('InAppBrowserNotice', () => {
  const setUserAgent = (ua: string) =>
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })

  it('names the app inside an Instagram webview', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 334.0.4.32.98')
    render(<InAppBrowserNotice />)
    expect(await screen.findByRole('note')).toHaveTextContent('Instagram')
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('copies a link that carries the captured source into the system browser', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 334.0.4.32.98')
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<InAppBrowserNotice />)
    fireEvent.click(await screen.findByRole('button'))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = new URL(writeText.mock.calls[0][0])
    expect(copied.searchParams.get('utm_source')).toBe('instagram.com')
    expect(copied.searchParams.get('utm_medium')).toBe('inapp')
  })

  it('renders nothing in a normal browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')
    const { container } = render(<InAppBrowserNotice />)
    expect(container).toBeEmptyDOMElement()
  })
})
