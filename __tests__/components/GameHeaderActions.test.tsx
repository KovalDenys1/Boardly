import { act, fireEvent, render, screen, within } from '@testing-library/react'
import GameHeaderActions from '@/components/game-chrome/GameHeaderActions'
import { showToast } from '@/lib/i18n-toast'

jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/components/LeaveIcon', () => ({ __esModule: true, default: () => <span data-testid="leave-icon" /> }))

describe('GameHeaderActions (#1577)', () => {
  it('copies the spectate link and offers Leave, side by side', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const onLeave = jest.fn()
    const { container } = render(<GameHeaderActions code="1311" onLeave={onLeave} allowSpectators />)

    const inline = container.querySelector('.game-header__actions-inline') as HTMLElement
    fireEvent.click(within(inline).getByRole('button', { name: 'game.ui.inviteSpectators' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/lobby\/1311\/spectate$/))
    await Promise.resolve()
    expect(showToast.success).toHaveBeenCalledWith('toast.linkCopied')

    fireEvent.click(within(inline).getByRole('button', { name: 'game.ui.leave' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('collapses both actions into one menu for the narrowest header', () => {
    const onLeave = jest.fn()
    const { container } = render(<GameHeaderActions code="1311" onLeave={onLeave} allowSpectators />)
    const trigger = within(container.querySelector('.game-header__actions-menu') as HTMLElement)
      .getByRole('button', { name: 'game.ui.moreActions' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'game.ui.inviteSpectators',
      'game.ui.leave',
    ])

    act(() => {
      fireEvent.keyDown(menu, { key: 'Escape' })
    })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'game.ui.leave' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('needs no menu when Leave is the only action', () => {
    const { container } = render(<GameHeaderActions code="1311" onLeave={() => {}} />)
    expect(container.querySelector('.game-header__actions-menu')).toBeNull()
    expect(screen.queryByRole('button', { name: 'game.ui.inviteSpectators' })).toBeNull()
    expect(screen.getByRole('button', { name: 'game.ui.leave' })).toBeTruthy()
  })

  it('shows no Leave that would do nothing', () => {
    const { container } = render(<GameHeaderActions code="1311" allowSpectators />)
    expect(screen.queryByRole('button', { name: 'game.ui.leave' })).toBeNull()
    expect(container.querySelector('.game-header__actions-menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'game.ui.inviteSpectators' })).toBeTruthy()
  })

  it('gives a spectator a link back to the lobby instead of Leave', () => {
    render(<GameHeaderActions code="1311" isSpectator allowSpectators />)
    expect(screen.getByRole('link', { name: 'game.ui.backToLobby' }).getAttribute('href')).toBe('/lobby/1311')
    expect(screen.queryByRole('button', { name: 'game.ui.leave' })).toBeNull()
  })
})
