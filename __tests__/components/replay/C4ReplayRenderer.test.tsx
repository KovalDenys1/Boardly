import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import C4ReplayRenderer from '@/components/replay/C4ReplayRenderer'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'
import en from '@/locales/en'

jest.mock('@/lib/i18n-helpers', () => {
  const { default: english } = jest.requireActual('@/locales/en')
  const t = (key: string, params: Record<string, unknown> = {}) => {
    const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], english)
    if (typeof text !== 'string') throw new Error(`missing key ${key}`)
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]))
  }
  return { useTranslation: () => ({ t }) }
})

const fixture: { players: ReplayPlayer[]; snapshots: ReplaySnapshotInput[] } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'connect_four.json'), 'utf-8'),
)
const steps = groupSteps('connect_four', fixture.snapshots)
const playerNameById = new Map(fixture.players.map((p) => [p.userId, p.name]))
const middle = steps[Math.floor(steps.length / 2)]

function renderStep(step: ReplayStep) {
  return render(
    <C4ReplayRenderer
      step={step}
      isFinalStep={step === steps.at(-1)}
      seats={fixture.players}
      playerNameById={playerNameById}
      viewerId={fixture.players[0].userId}
    />,
  )
}

type C4Data = { lastDroppedRow: number; lastDroppedCol: number; winningLine: [number, number][] | null }
const dataOf = (step: ReplayStep) => (step.state as { data: C4Data }).data

function withoutLastDrop(step: ReplayStep): ReplayStep {
  const state = step.state as { data: Record<string, unknown> }
  return { ...step, state: { ...state, data: { ...state.data, lastDroppedRow: null, lastDroppedCol: null } } }
}

const cells = () => screen.getAllByRole('img')
const cell = (row: number, col: number) => cells()[row * 7 + col]
const markerAt = (row: number, col: number) => cell(row, col).querySelector('[data-testid="c4-last-marker"]')

function scaledCells(): [number, number][] {
  return cells().flatMap((el, i) =>
    (el.firstElementChild as HTMLElement).style.transform === 'scale(1.12)' ? [[Math.floor(i / 7), i % 7] as [number, number]] : [],
  )
}

describe('C4ReplayRenderer', () => {
  it('draws an empty board of labelled pictures, not buttons, on game:start', () => {
    renderStep(steps[0])
    expect(screen.getByRole('group', { name: en.games.connect_four.board.label })).toBeInTheDocument()
    expect(cells()).toHaveLength(42)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(cell(5, 0)).toHaveAccessibleName('Row 6, column 1: empty')
    expect(screen.queryByTestId('c4-last-marker')).toBeNull()
    expect(scaledCells()).toEqual([])
  })

  it('rings the disc dropped on a middle step and nowhere else', () => {
    expect(middle.kind).toBe('move')
    renderStep(middle)
    const { lastDroppedRow, lastDroppedCol } = dataOf(middle)
    expect(screen.getAllByTestId('c4-last-marker')).toHaveLength(1)
    expect(markerAt(lastDroppedRow, lastDroppedCol)).not.toBeNull()
    expect(cell(lastDroppedRow, lastDroppedCol).getAttribute('aria-label')).toMatch(/: (red|yellow) disc$/)
  })

  it('finds the last disc from the previous board when neither the state nor the payload name it', () => {
    const { lastDroppedRow, lastDroppedCol } = dataOf(middle)
    renderStep({ ...withoutLastDrop(middle), payload: null })
    expect(markerAt(lastDroppedRow, lastDroppedCol)).not.toBeNull()
  })

  it('falls back to the top disc of the payload column when there is no previous board', () => {
    const { lastDroppedRow, lastDroppedCol } = dataOf(middle)
    renderStep({ ...withoutLastDrop(middle), prevState: null, payload: { col: lastDroppedCol } })
    expect(markerAt(lastDroppedRow, lastDroppedCol)).not.toBeNull()
  })

  it('shows the winning line on the final step', () => {
    const final = steps.at(-1)!
    const { winningLine } = dataOf(final)
    expect(winningLine).toHaveLength(4)
    renderStep(final)
    expect(scaledCells()).toEqual([...winningLine!].sort((a, b) => a[0] - b[0] || a[1] - b[1]))
  })

  it('renders nothing for a malformed state', () => {
    const { container } = renderStep({ ...steps[1], state: { data: { board: 'nope' } } })
    expect(container.firstChild).toBeNull()
  })
})
