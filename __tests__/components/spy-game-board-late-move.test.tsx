// @ts-nocheck
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SpyGameBoard from '@/app/(site)/lobby/[code]/components/SpyGameBoard'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { showToast } from '@/lib/i18n-toast'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key
  return { useTranslation: () => ({ t }) }
})
jest.mock('@/lib/analytics', () => ({ trackMoveSubmitApplied: jest.fn() }))
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}))
jest.mock('@/lib/sound-engine', () => ({ ...jest.requireActual('@/lib/sound-engine'), playCue: jest.fn() }))
jest.mock('@/components/Chat', () => ({ __esModule: true, default: () => null }))

const IDS = ['user-a', 'user-b', 'user-c', 'user-d']
const NAMES: Record<string, string> = { 'user-a': 'Alice', 'user-b': 'Bob', 'user-c': 'Carol', 'user-d': 'Dave' }

function votingGame() {
  const game = new SpyGame('game-1')
  for (const id of IDS) game.addPlayer({ id, name: NAMES[id] })
  game.startGame()
  const data = game.getState().data
  data.phase = SpyGamePhase.VOTING
  data.spyPlayerId = 'user-b'
  data.allLocationNames = ['Airport', 'Zoo']
  data.phaseStartTime = Date.now() - 59_000
  return game
}

function answerSpyActionWith(status: number, body: Record<string, unknown>) {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).endsWith('/spy-action')) {
      const make = () => ({ ok: status < 400, status, json: async () => body, clone: make })
      return make()
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ roleInfo: { role: 'Regular Player', location: 'Airport', locationRole: 'Pilot' } }),
    }
  })
}

async function voteForCarol(onRefresh: jest.Mock) {
  render(
    <SpyGameBoard
      gameId="game-1"
      lobbyCode="ABCD"
      lobbyCreatorId="user-a"
      players={IDS.map((id) => ({ id: `player-${id}`, userId: id, score: 0, name: NAMES[id], user: { username: NAMES[id] } }))}
      state={votingGame().getState()}
      currentUserId="user-a"
      isGuest={false}
      guestId={null}
      guestName={null}
      guestToken={null}
      onRefresh={onRefresh}
    />
  )
  const board = within(await screen.findByTestId('spy-board'))
  const carol = board.getAllByRole('button').find((button) => (button.textContent || '').includes('Carol'))
  fireEvent.click(carol)
  fireEvent.click(board.getByRole('button', { name: 'spy.confirmVote' }))
}

beforeEach(() => jest.clearAllMocks())

describe('SpyGameBoard: a vote the clock closed first', () => {
  it('shows the closed round without an error when the vote lands after the deadline', async () => {
    answerSpyActionWith(409, { error: 'Turn already ended', code: 'TURN_ALREADY_ENDED', skipped: true })
    const onRefresh = jest.fn().mockResolvedValue(undefined)

    await voteForCarol(onRefresh)

    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(showToast.error).not.toHaveBeenCalled()
    expect(playCue).not.toHaveBeenCalledWith('ui.error')
  })

  it('still reports a refused vote that the clock did not close', async () => {
    answerSpyActionWith(400, { error: 'Invalid move' })

    await voteForCarol(jest.fn().mockResolvedValue(undefined))

    await waitFor(() => expect(showToast.error).toHaveBeenCalled())
  })
})
