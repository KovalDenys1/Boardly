import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import MemoryReplayRenderer from '@/components/replay/MemoryReplayRenderer'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'
import type { MemoryCard } from '@/lib/games/memory-game'

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
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'memory.json'), 'utf-8'),
)
const steps = groupSteps('memory', fixture.snapshots)
const playerNameById = new Map(fixture.players.map((p) => [p.userId, p.name]))
const cardsOf = (step: ReplayStep) => (step.state as { data: { cards: MemoryCard[] } }).data.cards
const scoresOf = (step: ReplayStep) => (step.state as { data: { scores: Record<string, number> } }).data.scores
const isMiss = (step: ReplayStep) => (step.state as { data: { pendingMismatchCardIds: string[] } }).data.pendingMismatchCardIds.length === 2
const middle = steps.slice(Math.floor(steps.length / 2)).find(isMiss)!

function renderStep(step: ReplayStep) {
  return render(
    <MemoryReplayRenderer
      step={step}
      isFinalStep={step === steps.at(-1)}
      seats={fixture.players}
      playerNameById={playerNameById}
      viewerId={fixture.players[0].userId}
    />,
  )
}

const tiles = () => screen.getAllByRole('img')
const faceDownValues = (step: ReplayStep) => cardsOf(step).filter((c) => !c.isFlipped && !c.isMatched).map((c) => c.value)

describe('MemoryReplayRenderer', () => {
  it('draws every card face down, as pictures and not buttons, on game:start', () => {
    renderStep(steps[0])
    const cards = cardsOf(steps[0])
    expect(tiles()).toHaveLength(cards.length)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(tiles()[0]).toHaveAccessibleName('Card 1, face down')
    expect(document.querySelectorAll('.memory-tile-inner-flipped')).toHaveLength(0)
    for (const value of new Set(cards.map((c) => c.value))) expect(document.body.textContent).not.toContain(value)
  })

  it('shows the missed pair face up on a middle step and never a face-down card', () => {
    expect(faceDownValues(middle).length).toBeGreaterThan(0)
    renderStep(middle)
    const cards = cardsOf(middle)
    const [a, b] = (middle.state as { data: { pendingMismatchCardIds: string[] } }).data.pendingMismatchCardIds
    for (const id of [a, b]) {
      const index = cards.findIndex((c) => c.id === id)
      expect(tiles()[index]).toHaveAccessibleName(`Card ${index + 1}, ${cards[index].value}`)
    }
    const lastIndex = cards.findIndex((c) => c.id === (middle.payload as { cardId: string }).cardId)
    expect(document.querySelectorAll('[data-last="true"]')).toHaveLength(1)
    expect(tiles()[lastIndex]).toHaveAttribute('data-last', 'true')
    cards.forEach((card, index) => {
      const face = tiles()[index].querySelector('.memory-tile-face')!
      expect(face.textContent).toBe(card.isFlipped || card.isMatched ? card.value : '')
    })
    const shownFaces = cards.filter((c) => c.isFlipped || c.isMatched).map((c) => c.value)
    for (const value of faceDownValues(middle).filter((v) => !shownFaces.includes(v))) expect(document.body.textContent).not.toContain(value)
  })

  it('masks a face-down value even when the stored snapshot carries it', () => {
    const state = middle.state as { data: Record<string, unknown> }
    const leaky: ReplayStep = {
      ...middle,
      state: { ...state, data: { ...state.data, cards: [{ id: 'x', value: 'SECRET', isFlipped: false, isMatched: false }, ...cardsOf(middle).slice(1)] } },
    }
    renderStep(leaky)
    expect(document.body.textContent).not.toContain('SECRET')
    expect(tiles()[0]).toHaveAccessibleName('Card 1, face down')
  })

  it('ends with every card matched and the final pair count of each seat', () => {
    const final = steps.at(-1)!
    expect((final.state as { status: string }).status).toBe('finished')
    renderStep(final)
    expect(document.querySelectorAll('.memory-tile-matched')).toHaveLength(cardsOf(final).length)
    const scores = scoresOf(final)
    for (const player of fixture.players) {
      expect(screen.getByTestId(`memory-replay-score-${player.seat}`)).toHaveTextContent(`${player.name}${scores[player.userId]}`)
    }
    const pairs = cardsOf(final).length / 2
    expect(screen.getByTestId('memory-replay-pairs')).toHaveTextContent(`${pairs}/${pairs}`)
  })

  it('renders nothing for a malformed state', () => {
    const { container } = renderStep({ ...steps[1], state: { data: { cards: 'nope' } } })
    expect(container.firstChild).toBeNull()
  })
})
