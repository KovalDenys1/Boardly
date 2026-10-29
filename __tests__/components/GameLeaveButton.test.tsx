import { fireEvent, render, screen } from '@testing-library/react'
import GameLeaveButton from '@/components/game-chrome/GameLeaveButton'

jest.mock('@/components/LeaveIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="leave-icon" />,
}))

describe('GameLeaveButton', () => {
  it('renders a button with the given label and calls onClick', () => {
    const onClick = jest.fn()
    render(<GameLeaveButton label="Leave" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Leave' })
    expect(button.className).toContain('game-leave-button')
    expect(button.className).toContain('game-leave-button--leave')
    expect(screen.getByTestId('leave-icon')).toBeTruthy()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders a link for the spectator variant, without the leave icon', () => {
    render(<GameLeaveButton label="← Back to lobby" href="/lobby/1234" variant="back" />)

    const link = screen.getByRole('link', { name: '← Back to lobby' })
    expect(link.getAttribute('href')).toBe('/lobby/1234')
    expect(link.className).toContain('game-leave-button--back')
    expect(screen.queryByTestId('leave-icon')).toBeNull()
  })

  it('gives the way back an arrow of its own, for when its label is hidden like Leave\'s (#1577)', () => {
    const { container } = render(<GameLeaveButton label="← Back to lobby" href="/lobby/1234" variant="back" />)
    const icon = container.querySelector('.game-leave-button__back-icon')
    expect(icon).not.toBeNull()
    expect(icon!.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('is compact by default and keeps the label in the accessible name', () => {
    render(<GameLeaveButton label="Leave" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Leave' })
    expect(button.className).toContain('game-leave-button--compact')

    render(<GameLeaveButton label="Leave" onClick={() => {}} compact={false} />)
    expect(screen.getAllByRole('button', { name: 'Leave' })[1].className).not.toContain('game-leave-button--compact')
  })
})
