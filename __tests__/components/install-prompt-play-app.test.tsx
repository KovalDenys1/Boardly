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

  it('offers the install on the web once the browser allows it', () => {
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()

    expect(screen.getByRole('button', { name: 'installPrompt.install' })).toBeInTheDocument()
  })
})
