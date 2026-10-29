import { fireEvent, render, screen } from '@testing-library/react'
import PromoVideo from '@/components/HomePage/PromoVideo'
import { promoVideoFor } from '@/lib/promo-video'

let mockLanguage = 'en'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: mockLanguage },
  }),
}))

function videoElement(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video')
  if (!video) throw new Error('no <video> rendered')
  return video
}

describe('PromoVideo (#1470)', () => {
  beforeEach(() => {
    mockLanguage = 'en'
  })

  it('loads nothing before the visitor presses play', () => {
    const { container } = render(<PromoVideo />)
    const video = videoElement(container)
    expect(video.getAttribute('preload')).toBe('none')
    expect(video.autoplay).toBe(false)
    expect(video.getAttribute('poster')).toBe(promoVideoFor('en').poster)
  })

  it('swaps the source when the language changes, without a reload', () => {
    mockLanguage = 'en'
    const { container, rerender } = render(<PromoVideo />)
    const before = videoElement(container)

    mockLanguage = 'uk'
    rerender(<PromoVideo />)
    expect(videoElement(container).getAttribute('src')).toBe(promoVideoFor('uk').src)

    mockLanguage = 'no'
    rerender(<PromoVideo />)
    expect(videoElement(container)).toBe(before)
    expect(videoElement(container).getAttribute('src')).toBe(promoVideoFor('no').src)
  })

  it('starts playback from the play button and hands over to the native controls', () => {
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = render(<PromoVideo />)
    expect(videoElement(container).controls).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'home.promoVideo.play' }))

    expect(play).toHaveBeenCalledTimes(1)
    expect(videoElement(container).controls).toBe(true)
    expect(screen.queryByRole('button', { name: 'home.promoVideo.play' })).toBeNull()
    play.mockRestore()
  })

  it('names the video for screen readers', () => {
    const { container } = render(<PromoVideo />)
    expect(videoElement(container).getAttribute('aria-label')).toBe('home.promoVideo.label')
  })
})
