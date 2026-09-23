/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render } from '@testing-library/react'
import MemoryGameBoard from '@/app/lobby/[code]/components/MemoryGameBoard'
import { MemoryGame } from '@/lib/games/memory-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { trackMoveSubmitApplied } from '@/lib/analytics'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn(), errorFrom: jest.fn() },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/sounds', () => ({
  sounds: { play: jest.fn() },
}))

jest.mock('@/lib/analytics', () => ({
  trackDiscordCta: jest.fn(),
  trackSignupPrompt: jest.fn(),
  trackPushPrompt: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/hooks/useInviteShare', () => ({
  useInviteShare: () => jest.fn(),
}))

const HUMAN_USER_ID = 'guest-4d0bbf27-1f70-4f4a-a0d9-3f4f0a4f2a11'
const OTHER_USER_ID = 'guest-9a1c7e55-2b3d-4e6f-8a90-1b2c3d4e5f60'

function playingMemoryState() {
  const engine = new MemoryGame('cmuabzhpu000fyosihrvaoydp', { maxPlayers: 4, minPlayers: 2 })
  engine.addPlayer({ id: HUMAN_USER_ID, name: 'Denys', score: 0 })
  engine.addPlayer({ id: OTHER_USER_ID, name: 'Ola', score: 0 })
  engine.startGame()
  return engine.getState()
}

function renderPlayingBoard() {
  return render(
    <MemoryGameBoard
      gameId="cmuabzhpu000fyosihrvaoydp"
      lobbyCode="9952"
      state={playingMemoryState()}
      players={[
        { id: 'cmuac0zq1001lyosiuhb5qhlv', userId: HUMAN_USER_ID, score: 0, name: 'Denys' },
        { id: 'cmuac100b001oyosi92tcuxv2', userId: OTHER_USER_ID, score: 0, name: 'Ola' },
      ]}
      currentUserId={HUMAN_USER_ID}
      isGuest
    />
  )
}

async function flipFirstCard(container: HTMLElement) {
  const tile = container.querySelector<HTMLButtonElement>('.memory-tile:not([disabled])')
  expect(tile).not.toBeNull()
  await act(async () => {
    fireEvent.click(tile!)
  })
}

/**
 * #1063. Every released game reports `move_submit_applied` except Memory, whose
 * board posts moves itself instead of going through `useGameActions`, so the
 * game that brings the most first-time players had no move telemetry at all.
 */
describe('MemoryGameBoard move telemetry (#1063)', () => {
  const mockFetch = fetchWithGuest as jest.Mock
  const mockTrack = trackMoveSubmitApplied as jest.Mock

  beforeEach(() => {
    mockFetch.mockReset()
    mockTrack.mockReset()
  })

  it('reports an applied flip with the memory game type', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const { container } = renderPlayingBoard()

    await flipFirstCard(container)

    expect(mockTrack).toHaveBeenCalledTimes(1)
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        gameType: 'memory',
        moveType: 'flip',
        isGuest: true,
        success: true,
        applied: true,
        statusCode: 200,
        source: 'memory_board',
      })
    )
  })

  it('reports a rejected flip as not applied, with the status code', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'STATE_CONFLICT' }),
    })
    const { container } = renderPlayingBoard()

    await flipFirstCard(container)

    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        gameType: 'memory',
        success: false,
        applied: false,
        statusCode: 409,
      })
    )
  })

  it('reports a network failure as not applied', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'))
    const { container } = renderPlayingBoard()

    await flipFirstCard(container)

    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: 'memory', success: false, applied: false })
    )
  })
})
