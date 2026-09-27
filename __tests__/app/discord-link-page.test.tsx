import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DiscordLinkPage from '@/app/discord/link/page'

/**
 * #1218: the link start answers RECENT_SIGN_IN_REQUIRED for a session that signed in more than
 * ten minutes ago. The page says so in the viewer's language and offers the way out: sign out,
 * sign in, and land back on /discord/link.
 */

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockSignOut = jest.fn(async () => undefined)

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }),
  signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('/discord/link asks for a fresh sign-in when the start requires one (#1218)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/discord/role-connection' && (init?.method ?? 'GET') === 'GET') {
        return json(200, { linked: false, hasScope: false, hasToken: false, ready: false })
      }
      if (url === '/api/discord/link' && init?.method === 'POST') {
        return json(403, { error: 'Sign in again to link Discord', code: 'RECENT_SIGN_IN_REQUIRED' })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('shows the localized prompt, and signing in again comes back here', async () => {
    render(<DiscordLinkPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'discordLink.connect' }))

    expect(await screen.findByText('discordLink.reauthTitle')).toBeTruthy()
    expect(screen.getByText('discordLink.reauthBody')).toBeTruthy()
    expect(screen.queryByText('discordLink.failed')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'discordLink.signInAgain' }))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/login?returnUrl=%2Fdiscord%2Flink'))
    expect(mockSignOut).toHaveBeenCalledWith({ redirect: false })
  })
})
