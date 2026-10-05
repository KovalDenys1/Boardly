import { render } from '@testing-library/react'
import Footer from '@/components/Footer'

jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string) => {
        const raw = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
        return typeof raw === 'string' ? raw : key
      },
    }),
  }
})

const launchstagLinks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="https://launchstag.com"]'))

describe('Launchstag badge in the footer (#1291)', () => {
  it('renders the link and image of the Launchstag snippet when the page asks for it', () => {
    const { container } = render(<Footer listingBadge />)

    const [link, ...others] = launchstagLinks(container)
    expect(others).toHaveLength(0)
    expect(link.getAttribute('href')).toBe('https://launchstag.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener')

    const images = Array.from(link.querySelectorAll('img')).map((image) => ({
      src: image.getAttribute('src'),
      alt: image.getAttribute('alt'),
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
      loading: image.getAttribute('loading'),
    }))
    const badge = { alt: 'Featured on Launchstag', width: '198', height: '62', loading: 'lazy' }
    expect(images).toEqual([
      { src: '/launchstag/badge-light.svg', ...badge },
      { src: '/launchstag/badge-dark.svg', ...badge },
    ])
  })

  it('renders no badge on a page that does not ask for it', () => {
    const { container } = render(<Footer />)

    expect(launchstagLinks(container)).toHaveLength(0)
    expect(container.querySelector('img')).toBeNull()
  })
})
