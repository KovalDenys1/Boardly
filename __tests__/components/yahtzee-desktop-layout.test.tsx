import { render } from '@testing-library/react'
import YahtzeeDesktopLayout from '@/components/yahtzee/YahtzeeDesktopLayout'

function renderLayout(chat: boolean) {
  return render(
    <YahtzeeDesktopLayout
      header={<div data-testid="header" />}
      status={<div data-testid="status" />}
      board={<div data-testid="board" />}
      events={<div data-testid="events" />}
      chat={chat ? <div data-testid="chat" /> : null}
    />,
  )
}

describe('YahtzeeDesktopLayout (#1363)', () => {
  it('uses the shared game grid with the one header first (#1577)', () => {
    const { getByTestId } = renderLayout(false)
    const grid = getByTestId('header').parentElement!
    expect(grid.classList.contains('ttt-grid')).toBe(true)
    expect(grid.parentElement!.classList.contains('ttt-desktop-layout')).toBe(true)
    expect(grid.firstElementChild).toBe(getByTestId('header'))
  })

  it('puts the status banner directly above the board in the centre column', () => {
    const { getByTestId } = renderLayout(false)
    const centre = getByTestId('status').parentElement!
    expect(centre.classList.contains('ttt-center-col')).toBe(true)
    expect(centre.firstElementChild).toBe(getByTestId('status'))
    expect(getByTestId('status').nextElementSibling).toBe(getByTestId('board'))
  })

  it('keeps events and chat in the right column', () => {
    const { getByTestId, queryByTestId, rerender } = renderLayout(true)
    const right = getByTestId('events').parentElement!
    expect(right.classList.contains('ttt-right-col')).toBe(true)
    expect(getByTestId('chat').parentElement).toBe(right)
    rerender(
      <YahtzeeDesktopLayout header={null} status={null} board={null} events={<div data-testid="events" />} chat={null} />,
    )
    expect(queryByTestId('chat')).toBeNull()
  })
})
