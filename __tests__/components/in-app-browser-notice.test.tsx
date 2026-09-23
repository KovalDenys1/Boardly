import { render, screen } from '@testing-library/react'
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

  it('renders nothing in a normal browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')
    const { container } = render(<InAppBrowserNotice />)
    expect(container).toBeEmptyDOMElement()
  })
})
