import { render, screen } from '@testing-library/react'
import { HeaderNavigation } from '@/components/Header/HeaderNavigation'

const mockPush = jest.fn()
let mockPathname = '/'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('HeaderNavigation responsive split', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/'
  })

  it('keeps the full navigation hidden until the large breakpoint', () => {
    const { container } = render(
      <HeaderNavigation
        isAuthenticated={false}
        isGuest={false}
      />
    )

    const navigationContainer = container.firstChild as HTMLElement | null

    expect(screen.getByRole('button', { name: /home/i })).toBeTruthy()
    expect(navigationContainer?.className).toContain('hidden')
    expect(navigationContainer?.className).toContain('xl:flex')
  })
})
