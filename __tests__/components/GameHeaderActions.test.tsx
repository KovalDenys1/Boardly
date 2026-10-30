import { readFileSync } from 'fs'
import path from 'path'
import postcss from 'postcss'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import GameHeaderActions from '@/components/game-chrome/GameHeaderActions'
import { showToast } from '@/lib/i18n-toast'
import { playCue } from '@/lib/sound-engine'
import { isSoundEnabled, setSoundEnabled } from '@/lib/sound-settings'

jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/components/LeaveIcon', () => ({ __esModule: true, default: () => <span data-testid="leave-icon" /> }))

beforeEach(() => {
  setSoundEnabled(true)
  jest.clearAllMocks()
})

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

  it('folds sound and Leave into the menu when there is no invite', () => {
    const { container } = render(<GameHeaderActions code="1311" onLeave={() => {}} />)
    expect(screen.queryByRole('button', { name: 'game.ui.inviteSpectators' })).toBeNull()
    expect(screen.getByRole('button', { name: 'game.ui.leave' })).toBeTruthy()
    fireEvent.click(within(container.querySelector('.game-header__actions-menu') as HTMLElement).getByRole('button', { name: 'game.ui.moreActions' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'game.ui.sound' })).toBeTruthy()
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['game.ui.leave'])
  })

  it('shows no Leave that would do nothing', () => {
    render(<GameHeaderActions code="1311" allowSpectators />)
    expect(screen.queryByRole('button', { name: 'game.ui.leave' })).toBeNull()
    expect(screen.getByRole('button', { name: 'game.ui.inviteSpectators' })).toBeTruthy()
  })

  it('needs no menu when sound is the only action', () => {
    const { container } = render(<GameHeaderActions code="1311" />)
    expect(container.querySelector('.game-header__actions-menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'game.ui.sound' })).toBeTruthy()
  })

  it('gives a spectator a link back to the lobby instead of Leave', () => {
    render(<GameHeaderActions code="1311" isSpectator allowSpectators />)
    expect(screen.getByRole('link', { name: 'game.ui.backToLobby' }).getAttribute('href')).toBe('/lobby/1311')
    expect(screen.queryByRole('button', { name: 'game.ui.leave' })).toBeNull()
  })
})

describe('the sound control lives in the header, for every game (#1566)', () => {
  it('switches the one sound setting from the header and shows its state', () => {
    const { container } = render(<GameHeaderActions code="1311" onLeave={() => {}} allowSpectators />)
    const inline = container.querySelector('.game-header__actions-inline') as HTMLElement
    const sound = within(inline).getByRole('button', { name: 'game.ui.sound' })
    expect(sound.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(sound)
    expect(isSoundEnabled()).toBe(false)
    expect(sound.getAttribute('aria-pressed')).toBe('false')
    expect(playCue).not.toHaveBeenCalled()

    fireEvent.click(sound)
    expect(isSoundEnabled()).toBe(true)
    expect(sound.getAttribute('aria-pressed')).toBe('true')
    expect(playCue).toHaveBeenCalledWith('ui.select')
  })

  it('reflects a change made anywhere else', () => {
    const { container } = render(<GameHeaderActions code="1311" onLeave={() => {}} />)
    const sound = within(container.querySelector('.game-header__actions-inline') as HTMLElement).getByRole('button', { name: 'game.ui.sound' })
    act(() => setSoundEnabled(false))
    expect(sound.getAttribute('aria-pressed')).toBe('false')
  })

  it('folds into the one menu with the other actions and stays open while it is switched', () => {
    const { container } = render(<GameHeaderActions code="1311" onLeave={() => {}} allowSpectators />)
    fireEvent.click(within(container.querySelector('.game-header__actions-menu') as HTMLElement).getByRole('button', { name: 'game.ui.moreActions' }))
    const menu = screen.getByRole('menu')
    const items = [...menu.querySelectorAll('[role^="menuitem"]')]
    expect(items.map((item) => item.getAttribute('role'))).toEqual(['menuitemcheckbox', 'menuitem', 'menuitem'])
    const sound = within(menu).getByRole('menuitemcheckbox', { name: 'game.ui.sound' })
    expect(sound.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(sound)
    expect(isSoundEnabled()).toBe(false)
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(within(screen.getByRole('menu')).getByRole('menuitemcheckbox', { name: 'game.ui.sound' }).getAttribute('aria-checked')).toBe('false')
  })

  it("folds a spectator's sound and way back into the same menu as a player's", () => {
    const { container } = render(<GameHeaderActions code="1311" isSpectator allowSpectators />)
    const inline = container.querySelector('.game-header__actions-inline') as HTMLElement
    expect(within(inline).getByRole('button', { name: 'game.ui.sound' })).toBeTruthy()
    expect(within(inline).getByRole('link', { name: 'game.ui.backToLobby' }).getAttribute('href')).toBe('/lobby/1311')

    fireEvent.click(within(container.querySelector('.game-header__actions-menu') as HTMLElement).getByRole('button', { name: 'game.ui.moreActions' }))
    const menu = screen.getByRole('menu')
    expect([...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.getAttribute('role'))).toEqual(['menuitemcheckbox', 'menuitem'])
    const back = within(menu).getByRole('menuitem', { name: 'game.ui.returnToLobby' })
    expect(back.getAttribute('href')).toBe('/lobby/1311')
  })
})

describe('sound has one place on a game screen (#1566)', () => {
  const css = postcss.parse(readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8'))
  const unconditional = (selector: string) => {
    const decls: Record<string, string> = {}
    css.walkRules((rule) => {
      const parent = rule.parent
      const topLevel = parent?.type === 'root' || (parent?.type === 'atrule' && (parent as postcss.AtRule).name === 'layer')
      if (!topLevel || !rule.selectors.includes(selector)) return
      rule.walkDecls((decl) => { decls[decl.prop] = decl.value })
    })
    return decls
  }

  it("hides the site header's audio button while a game header's sound control is on the page", () => {
    expect(unconditional('body:has(.game-header__sound) .site-header-audio').display).toBe('none')
  })
})
