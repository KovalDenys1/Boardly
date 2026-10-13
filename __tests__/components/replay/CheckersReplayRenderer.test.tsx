import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import CheckersReplayRenderer from '@/components/replay/CheckersReplayRenderer'
import { squareName } from '@/components/boards/CheckersBoard'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))

type Data = { board: number[][]; lastMove: { path: [number, number][]; captured: [number, number][] } | null; winner: number | null }

const fixture: { players: ReplayPlayer[]; snapshots: ReplaySnapshotInput[] } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'checkers.json'), 'utf-8'),
)
const steps = groupSteps('checkers', fixture.snapshots)
const nameById = new Map(fixture.players.map((p) => [p.userId, p.name]))
const dataOf = (step: ReplayStep) => (step.state as { data: Data }).data

function renderStep(step: ReplayStep, viewerId: string | null = fixture.players[0].userId) {
  return render(
    <CheckersReplayRenderer
      step={step}
      isFinalStep={step === steps.at(-1)}
      seats={fixture.players}
      playerNameById={nameById}
      viewerId={viewerId}
    />,
  )
}

const square = (container: HTMLElement, sq: [number, number]) =>
  container.querySelector<HTMLButtonElement>(`[data-square="${squareName(sq)}"]`)!

describe('CheckersReplayRenderer', () => {
  it('draws the opening position on game:start with nothing highlighted and nothing to press', () => {
    const { container } = renderStep(steps[0])
    expect(steps[0].action).toBe('game:start')
    expect(container.querySelectorAll('.ck-piece')).toHaveLength(24)
    expect(container.querySelectorAll('.ck-last')).toHaveLength(0)
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(64)
    buttons.forEach((b) => expect(b).toBeDisabled())
  })

  it('highlights the whole path of a merged multi-jump and leaves the jumped squares empty', () => {
    const jump = steps.find((s) => s !== steps.at(-1) && (dataOf(s).lastMove?.path.length ?? 0) > 2)!
    expect(jump.snapshotIds.length).toBeGreaterThan(1)
    const { path, captured } = dataOf(jump).lastMove!
    const { container } = renderStep(jump)

    expect(container.querySelectorAll('.ck-last')).toHaveLength(path.length)
    for (const sq of path) expect(square(container, sq).querySelector('.ck-last')).not.toBeNull()
    for (const sq of captured) expect(square(container, sq).querySelector('.ck-piece')).toBeNull()
    expect(square(container, path.at(-1)!).querySelector('.ck-piece')).not.toBeNull()
  })

  it('shows the winner, the kings and the last move on the final step', () => {
    const final = steps.at(-1)!
    const data = dataOf(final)
    const { container } = renderStep(final)

    const winner = fixture.players.find((p) => p.seat === data.winner! - 1)!
    expect(screen.getByRole('group')).toHaveAccessibleName(
      `profile.gameReplay.captions.checkers.wins ${JSON.stringify({ player: winner.name })}`,
    )
    const kings = data.board.flat().filter((cell) => cell === 3 || cell === 4).length
    expect(kings).toBeGreaterThan(0)
    expect(container.querySelectorAll('.ck-crown')).toHaveLength(kings)
    expect(container.querySelectorAll('.ck-last')).toHaveLength(data.lastMove!.path.length)
  })

  it('names no winner before the final step', () => {
    renderStep(steps[1])
    expect(screen.getByRole('group')).not.toHaveAccessibleName()
  })

  it('puts side 2 at the bottom for the viewer on seat 1 and side 1 for anyone else', () => {
    const seat1 = fixture.players.find((p) => p.seat === 1)!.userId
    const first = (viewerId: string | null) => {
      const { container, unmount } = renderStep(steps[0], viewerId)
      const name = container.querySelector('[data-square]')!.getAttribute('data-square')
      unmount()
      return name
    }
    expect(first(seat1)).toBe('h1')
    expect(first(fixture.players[0].userId)).toBe('a8')
    expect(first('spectator')).toBe('a8')
    expect(first(null)).toBe('a8')
  })

  it('renders nothing for a malformed state', () => {
    const { container } = renderStep({ ...steps[1], state: { data: { board: 'x' } } })
    expect(container).toBeEmptyDOMElement()
  })
})
