import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import TttReplayRenderer from '@/components/replay/TttReplayRenderer'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

const fixture: { players: ReplayPlayer[]; snapshots: ReplaySnapshotInput[] } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'tic_tac_toe.json'), 'utf-8'),
)
const steps = groupSteps('tic_tac_toe', fixture.snapshots)
const playerNameById = new Map(fixture.players.map((p) => [p.userId, p.name]))

function renderStep(step: ReplayStep) {
  return render(
    <TttReplayRenderer
      step={step}
      isFinalStep={step === steps.at(-1)}
      seats={fixture.players}
      playerNameById={playerNameById}
      viewerId={fixture.players[0].userId}
    />,
  )
}

type TttState = { status: string; players: Array<Record<string, unknown>>; data: Record<string, unknown> }
const stateOf = (step: ReplayStep) => JSON.parse(JSON.stringify(step.state)) as TttState
const emptyBoard = () => [[null, null, null], [null, null, null], [null, null, null]]

const cell = (coord: string) => screen.getByRole('button', { name: `cell ${coord}` })
const cells = () => screen.getAllByRole('button', { name: /^cell / })

describe('TttReplayRenderer', () => {
  it('draws an empty, disabled board on game:start', () => {
    expect(steps[0].action).toBe('game:start')
    renderStep(steps[0])
    expect(cells()).toHaveLength(9)
    for (const c of cells()) {
      expect(c).toBeDisabled()
      expect(c.querySelector('svg')).toBeNull()
    }
    expect(document.querySelector('[data-last-move]')).toBeNull()
    expect(screen.getByTestId('ttt-replay-score')).toHaveAttribute('aria-label', 'Ada 0 : 0 Robo')
  })

  it('rings the cell the middle step marked, and only that one', () => {
    const step = steps[3]
    expect(step.payload).toEqual({ row: 1, col: 1 })
    renderStep(step)
    expect(cell('B2')).toHaveClass('ttt-cell--last')
    expect(cell('B2')).toHaveAttribute('data-last-move', 'true')
    expect(document.querySelectorAll('.ttt-cell--last')).toHaveLength(1)
    expect(document.querySelectorAll('.ttt-win')).toHaveLength(0)
    for (const c of cells()) expect(c).toBeDisabled()
  })

  it('shows the winning line and the series score on the final step', () => {
    const step = steps.at(-1)!
    renderStep(step)
    const won = document.querySelectorAll('.ttt-win')
    expect(Array.from(won).map((el) => el.getAttribute('aria-label'))).toEqual(['cell C1', 'cell B2', 'cell A3'])
    expect(cell('C1')).toHaveAttribute('data-last-move', 'true')
    expect(screen.getByTestId('ttt-replay-score')).toHaveAttribute('aria-label', 'Ada 1 : 0 Robo')
  })

  it('rings the mark the undo left on top, not a cell from the payload', () => {
    const state = stateOf(steps[3])
    expect((state.data.moveHistory as unknown[]).at(-1)).toMatchObject({ row: 1, col: 1 })
    renderStep({ ...steps[4], action: 'respond-undo', actionType: 'respond-undo', payload: { accept: true }, state, prevState: steps[4].state })
    expect(cell('B2')).toHaveAttribute('data-last-move', 'true')
    expect(cell('B2')).toHaveClass('ttt-cell--last')
    expect(cell('C3').querySelector('svg')).toBeNull()
  })

  it('clears the board on next-round and carries the series score', () => {
    const final = steps.at(-1)!
    const state = stateOf(final)
    state.status = 'playing'
    Object.assign(state.data, { board: emptyBoard(), winner: null, winningLine: null, moveCount: 0, moveHistory: [], currentSymbol: 'O' })
    renderStep({ ...final, index: final.index + 1, action: 'next-round', actionType: 'next-round', payload: {}, state, prevState: final.state, kind: 'move' })
    for (const c of cells()) expect(c.querySelector('svg')).toBeNull()
    expect(document.querySelector('[data-last-move]')).toBeNull()
    expect(document.querySelectorAll('.ttt-win')).toHaveLength(0)
    expect(screen.getByTestId('ttt-replay-score')).toHaveAttribute('aria-label', 'Ada 1 : 0 Robo')
  })

  it('reads the series score from winsBySymbol in a best-of match', () => {
    const final = steps.at(-1)!
    const state = stateOf(final)
    state.data.match = { targetRounds: 3, roundsPlayed: 3, winsBySymbol: { X: 1, O: 1 }, draws: 1 }
    state.players[0].score = 4
    state.players[1].score = 2
    renderStep({ ...final, state })
    expect(screen.getByTestId('ttt-replay-score')).toHaveAttribute('aria-label', 'Ada 1 : 1 Robo')
    expect(screen.getByTestId('ttt-replay-score')).toHaveTextContent('lobby.create.bestOfShort:{"rounds":3}')
  })

  it('renders nothing for a malformed state', () => {
    const { container } = renderStep({ ...steps[1], state: { data: { board: 'nope' } } })
    expect(container).toBeEmptyDOMElement()
  })
})
