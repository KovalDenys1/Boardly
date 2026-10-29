import { act, render, screen } from '@testing-library/react'
import InstallPrompt from '@/components/InstallPrompt'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function fireBeforeInstallPrompt() {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: jest.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
}

describe('InstallPrompt in the Play app (#1465)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    delete document.documentElement.dataset.appShell
  })

  it('renders nothing inside the app, even after beforeinstallprompt', () => {
    document.documentElement.dataset.appShell = 'play'
    const { container } = render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    expect(container).toBeEmptyDOMElement()
  })

  it('offers the install on the web once the browser allows it, to a visitor who came back', () => {
    window.localStorage.setItem('boardly:first-visit:v1', String(Date.now() - 13 * 60 * 60 * 1000))
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    expect(screen.getByRole('button', { name: 'installPrompt.install' })).toBeInTheDocument()
  })
})

// It covered 23 % of a 320x640 screen on the first page view, the join modal's Login / Sign Up included (#1457 V4).
describe('InstallPrompt on a first visit', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stays hidden on the first visit even when the browser allows it, and remembers when that was', () => {
    const { container } = render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    expect(container).toBeEmptyDOMElement()
    expect(Number(window.localStorage.getItem('boardly:first-visit:v1'))).toBeGreaterThan(Date.now() - 60_000)
  })

  it('stays hidden later the same day', () => {
    window.localStorage.setItem('boardly:first-visit:v1', String(Date.now() - 2 * 60 * 60 * 1000))
    const { container } = render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    expect(container).toBeEmptyDOMElement()
  })

  it('sits under every dialog layer when it does show', () => {
    window.localStorage.setItem('boardly:first-visit:v1', String(Date.now() - 24 * 60 * 60 * 1000))
    const { container } = render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    const layer = Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec((container.firstElementChild as HTMLElement).className)?.[1])
    expect(layer).toBeLessThan(50)
  })
})
