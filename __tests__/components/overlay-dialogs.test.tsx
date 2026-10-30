/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs'
import path from 'path'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthGateModal } from '@/components/AuthGateModal'
import FeedbackWidget from '@/components/FeedbackWidget'
import Modal from '@/components/Modal'
import GameInterruptedOverlay from '@/app/(site)/lobby/[code]/components/GameInterruptedOverlay'
import { zLayers } from '../../scripts/z-layer-rules'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ setGuestMode: jest.fn() }) }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/games',
}))

const pressEscape = () => fireEvent.keyDown(document, { key: 'Escape' })

/** #1549: every overlay is a modal dialog that keyboard and screen-reader users can open, use and leave. */
describe('the guest gate', () => {
  it('is a modal dialog named by its title', () => {
    render(<AuthGateModal dest="/games/yahtzee" onClose={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'header.authGateTitle' })).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus to the name field on open', () => {
    render(<AuthGateModal dest="/games/yahtzee" onClose={() => {}} />)

    expect(document.activeElement).toBe(screen.getByPlaceholderText('guest.namePlaceholder'))
  })

  it('closes on Escape and from its close button', () => {
    const onClose = jest.fn()
    const onDismiss = jest.fn()
    render(<AuthGateModal dest="/games/yahtzee" onClose={onClose} onDismiss={onDismiss} />)

    pressEscape()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('where the gate is the page, neither Escape nor a close button dismisses it', () => {
    const onClose = jest.fn()
    render(<AuthGateModal dest="/lobby/create" onClose={onClose} dismissible={false} />)

    pressEscape()

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull()
  })
})

describe('the game-interrupted overlay', () => {
  it('is a modal dialog named by its heading', () => {
    render(<GameInterruptedOverlay reason="abandoned" onRedirect={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'lobby.gameAbandoned' })).toHaveAttribute('aria-modal', 'true')
  })

  it('opens by itself, so focus lands on the dialog rather than on a control nobody chose', () => {
    render(<GameInterruptedOverlay reason="abandoned" onRedirect={() => {}} />)

    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'lobby.gameAbandoned' }))
  })

  it('returns to the lobby on Escape and from its close button', () => {
    const onRedirect = jest.fn()
    render(<GameInterruptedOverlay reason="abandoned" onRedirect={onRedirect} />)

    pressEscape()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(onRedirect).toHaveBeenCalledTimes(2)
  })
})

describe('stacked dialogs', () => {
  function Stack({ onCloseBelow, onCloseAbove, aboveOpen = true }: { onCloseBelow: () => void; onCloseAbove: () => void; aboveOpen?: boolean }) {
    return (
      <>
        <Modal isOpen onClose={onCloseBelow} title="Below">
          <button type="button">Report</button>
        </Modal>
        <Modal isOpen={aboveOpen} onClose={onCloseAbove} title="Above">
          <button type="button">Send</button>
        </Modal>
      </>
    )
  }

  it('Escape closes only the dialog on top', () => {
    const onCloseBelow = jest.fn()
    const onCloseAbove = jest.fn()
    render(<Stack onCloseBelow={onCloseBelow} onCloseAbove={onCloseAbove} />)

    pressEscape()

    expect(onCloseAbove).toHaveBeenCalledTimes(1)
    expect(onCloseBelow).not.toHaveBeenCalled()
  })

  it('once the top one has closed, Escape reaches the one below', () => {
    const onCloseBelow = jest.fn()
    const onCloseAbove = jest.fn()
    const { rerender } = render(<Stack onCloseBelow={onCloseBelow} onCloseAbove={onCloseAbove} />)

    rerender(<Stack onCloseBelow={onCloseBelow} onCloseAbove={onCloseAbove} aboveOpen={false} />)
    pressEscape()

    expect(onCloseBelow).toHaveBeenCalledTimes(1)
    expect(onCloseAbove).not.toHaveBeenCalled()
  })

  it('closing the top one leaves the page locked under the one still open', () => {
    const onCloseBelow = jest.fn()
    const onCloseAbove = jest.fn()
    const { rerender } = render(<Stack onCloseBelow={onCloseBelow} onCloseAbove={onCloseAbove} />)

    rerender(<Stack onCloseBelow={onCloseBelow} onCloseAbove={onCloseAbove} aboveOpen={false} />)

    expect(document.body.style.overflow).toBe('hidden')
  })
})

describe('a sheet', () => {
  it('is not capped to a fraction of the phone, and clears the home indicator', () => {
    render(
      <Modal isOpen onClose={() => {}} aria-label="Sheet" placement="sheet" maxWidth="md" panelClassName="bg-bd-bg">
        <p>Body</p>
      </Modal>
    )
    const panel = screen.getByRole('dialog', { name: 'Sheet' })

    expect(panel.style.maxWidth).toBe('')
    expect(panel.className).toContain('env(safe-area-inset-bottom)')
  })
})

describe('the feedback panel', () => {
  it('floats under the header, so a header menu covers its button', () => {
    render(<FeedbackWidget />)

    const layers = zLayers(readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8'))
    const layer = /(?:^|\s)z-([a-z]+)(?:\s|$)/.exec(screen.getByRole('button', { name: 'feedback.buttonAriaLabel' }).className)?.[1] ?? ''
    expect(layers.get(layer)).toBeLessThan(layers.get('header')!)
  })

  it('is a modal dialog named by its title, with focus in the message field', () => {
    render(<FeedbackWidget />)

    fireEvent.click(screen.getByRole('button', { name: 'feedback.buttonAriaLabel' }))

    expect(screen.getByRole('dialog', { name: 'feedback.title' })).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(screen.getByPlaceholderText('feedback.messagePlaceholder'))
  })

  it('closes on Escape and hands focus back to the button that opened it', () => {
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'feedback.buttonAriaLabel' })

    trigger.focus()
    fireEvent.click(trigger)
    pressEscape()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes from its close button', () => {
    render(<FeedbackWidget />)

    fireEvent.click(screen.getByRole('button', { name: 'feedback.buttonAriaLabel' }))
    fireEvent.click(screen.getByRole('button', { name: 'feedback.closeAriaLabel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
