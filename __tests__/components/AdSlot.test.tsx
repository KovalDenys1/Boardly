import { render, screen, waitFor } from '@testing-library/react'
import AdSlot from '@/components/AdSlot'

const mockUseSession = jest.fn()

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}))

function renderSlot({ adsEnabled }: { adsEnabled: boolean }) {
  if (adsEnabled) {
    process.env.NEXT_PUBLIC_ADS_ENABLED = 'true'
  } else {
    delete process.env.NEXT_PUBLIC_ADS_ENABLED
  }
  return render(<AdSlot slot="1234567890" />)
}

const insSelector = 'ins.adsbygoogle'

describe('AdSlot', () => {
  const originalEnv = process.env.NEXT_PUBLIC_ADS_ENABLED

  beforeEach(() => {
    jest.clearAllMocks()
    ;(window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle = []
    global.fetch = jest.fn()
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_ADS_ENABLED = originalEnv
  })

  it('renders nothing while the master switch is off, even for a free visitor', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' })

    const { container } = renderSlot({ adsEnabled: false })

    await waitFor(() => expect(container.querySelector(insSelector)).toBeNull())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows the slot to a signed-out visitor without asking the server', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' })

    const { container } = renderSlot({ adsEnabled: true })

    await waitFor(() => expect(container.querySelector(insSelector)).not.toBeNull())
    expect(screen.getByText('Advertisement')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(container.querySelector(insSelector)).toHaveAttribute('data-ad-slot', '1234567890')
  })

  it('hides the slot from a premium account', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ isPremium: true }),
    })

    const { container } = renderSlot({ adsEnabled: true })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/user/purchases', expect.anything()))
    await waitFor(() => expect(container.querySelector(insSelector)).toBeNull())
  })

  it('shows the slot to a signed-in account without premium', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ isPremium: false }),
    })

    const { container } = renderSlot({ adsEnabled: true })

    await waitFor(() => expect(container.querySelector(insSelector)).not.toBeNull())
  })

  it('shows nothing when the premium lookup fails, rather than risking an ad on a payer', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' })
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('offline'))

    const { container } = renderSlot({ adsEnabled: true })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector(insSelector)).toBeNull())
  })

  it('waits for the session before deciding', async () => {
    mockUseSession.mockReturnValue({ status: 'loading' })

    const { container } = renderSlot({ adsEnabled: true })

    await waitFor(() => expect(container.querySelector(insSelector)).toBeNull())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('pushes the slot to adsbygoogle exactly once', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' })

    const { container } = renderSlot({ adsEnabled: true })

    await waitFor(() => expect(container.querySelector(insSelector)).not.toBeNull())
    const queue = (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle
    expect(queue).toHaveLength(1)
  })

  it('collapses the wrapper when AdSense reports the slot unfilled', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' })

    const { container } = renderSlot({ adsEnabled: true })

    const ins = await waitFor(() => {
      const node = container.querySelector(insSelector)
      expect(node).not.toBeNull()
      return node as HTMLElement
    })

    const wrapper = ins.parentElement as HTMLElement
    expect(wrapper).not.toHaveAttribute('hidden')

    ins.setAttribute('data-ad-status', 'unfilled')

    await waitFor(() => expect(wrapper).toHaveAttribute('hidden'))
  })
})
