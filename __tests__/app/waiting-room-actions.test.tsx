/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import WaitingRoomActions from '@/app/lobby/[code]/components/WaitingRoomActions'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function build(playerCount: number, gameType: string, minPlayers: number) {
  const lobby = { gameType, maxPlayers: 4, creatorId: 'host', creator: { username: 'Host' } }
  const game = {
    players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, user: { bot: false } })),
  }
  return render(
    <WaitingRoomActions
      game={game as never}
      lobby={lobby as never}
      minPlayers={minPlayers}
      canStartGame
      startingGame={false}
      onStartGame={jest.fn()}
    />
  )
}

describe('WaitingRoomActions — the lone creator (#814)', () => {
  it('tells a host alone in a bot-supported game that a bot will join', () => {
    // 193 of 221 lobbies that never started had exactly one person, and none
    // used the add-bot action hidden in the empty player slot. Starting already
    // works here — the missing piece was saying so.
    build(1, 'memory', 2)
    expect(screen.getByText('game.ui.botAutoAddTip')).toBeTruthy()
  })

  it('tells a host alone in a solo-capable game that they can just start', () => {
    build(1, 'yahtzee', 1)
    expect(screen.getByText('game.ui.startSoloTip')).toBeTruthy()
  })

  it('says nothing extra once a second player is present', () => {
    build(2, 'memory', 2)
    expect(screen.queryByText('game.ui.botAutoAddTip')).toBeNull()
    expect(screen.queryByText('game.ui.startSoloTip')).toBeNull()
  })
})

describe('WaitingRoomActions — the floating Chat button (#1383)', () => {
  const lobby = { gameType: 'memory', maxPlayers: 4, creatorId: 'host', creator: { username: 'Host' } }
  const game = { players: [{ id: 'p0', user: { bot: false } }, { id: 'p1', user: { bot: false } }] }

  it('reserves the button\'s width at the bar\'s right end when the page shows it', () => {
    const { container } = render(
      <WaitingRoomActions game={game as never} lobby={lobby as never} minPlayers={2} canStartGame startingGame={false} onStartGame={jest.fn()} reserveChatButton />
    )
    const bar = container.firstElementChild as HTMLElement
    expect(bar.classList.contains('waiting-room-actions')).toBe(true)
    expect(bar.classList.contains('sm:pr-40')).toBe(true)
    expect(bar.classList.contains('sm:pr-6')).toBe(false)
  })

  it('keeps the normal padding when there is no chat', () => {
    const { container } = render(
      <WaitingRoomActions game={game as never} lobby={lobby as never} minPlayers={2} canStartGame={false} startingGame={false} onStartGame={jest.fn()} />
    )
    const bar = container.firstElementChild as HTMLElement
    expect(bar.classList.contains('sm:pr-6')).toBe(true)
    expect(bar.classList.contains('sm:pr-40')).toBe(false)
  })
})
