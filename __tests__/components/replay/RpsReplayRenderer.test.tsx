import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import RpsReplayRenderer from '@/components/replay/RpsReplayRenderer'
import { getGameMetadata } from '@/lib/game-catalog'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'
import type { RPSRound } from '@/lib/games/rock-paper-scissors-game'

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
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'rock_paper_scissors.json'), 'utf-8'),
)
const steps = groupSteps('rock_paper_scissors', fixture.snapshots)
const playerNameById = new Map(fixture.players.map((p) => [p.userId, p.name]))
const [ada, robo] = fixture.players
const roundsOf = (step: ReplayStep) => (step.state as { data: { rounds: RPSRound[] } }).data.rounds
const scoresOf = (step: ReplayStep) => (step.state as { data: { scores: Record<string, number> } }).data.scores
const label = (choice: string) => choice.charAt(0).toUpperCase() + choice.slice(1)

function renderStep(step: ReplayStep) {
  return render(
    <RpsReplayRenderer step={step} isFinalStep={step === steps.at(-1)} seats={fixture.players} playerNameById={playerNameById} viewerId={ada.userId} />,
  )
}

const hand = (name: string) => screen.getByTestId(`rps-replay-hand-${name}`)
const roundItems = () => within(screen.getByRole('list')).queryAllByRole('listitem')

describe('RpsReplayRenderer', () => {
  it('makes one step per round, so the fixture has a start and a step for each round', () => {
    expect(steps).toHaveLength(roundsOf(steps.at(-1)!).length + 1)
  })

  it('opens with both hands still choosing, empty pips and no rounds', () => {
    renderStep(steps[0])
    expect(hand(ada.name)).toHaveAccessibleName(`${ada.name}: Choosing…`)
    expect(hand(robo.name)).toHaveAccessibleName(`${robo.name}: Choosing…`)
    expect(screen.getByTestId('rps-replay-score')).toHaveTextContent('0:0')
    expect(roundItems()).toHaveLength(0)
  })

  it('shows both choices of a middle round, its winner and the rounds so far', () => {
    const middle = steps[2]
    const round = roundsOf(middle).at(-1)!
    renderStep(middle)
    for (const player of [ada, robo]) {
      const outcome = round.winner === 'draw' ? 'Draw - No points' : round.winner === player.userId ? 'Win' : 'Loss'
      expect(hand(player.name)).toHaveAccessibleName(`${player.name}: ${label(round.choices[player.userId])}, ${outcome}`)
    }
    expect(roundItems()).toHaveLength(2)
    expect(roundItems()[1]).toHaveAttribute('aria-current', 'step')
    const scores = scoresOf(middle)
    expect(screen.getByTestId('rps-replay-score')).toHaveTextContent(`${scores[ada.userId]}:${scores[robo.userId]}`)
  })

  it('fills the win pips to the final score and lists every round', () => {
    const final = steps.at(-1)!
    renderStep(final)
    const scores = scoresOf(final)
    expect(screen.getByLabelText(`${scores[ada.userId]}/2`, { selector: '[data-seat="0"] *, [data-seat="0"]' })).toBeInTheDocument()
    expect(screen.getByLabelText(`${scores[robo.userId]}/2`, { selector: '[data-seat="1"] *, [data-seat="1"]' })).toBeInTheDocument()
    expect(roundItems()).toHaveLength(roundsOf(final).length)
  })

  it('scrolls the rounds rail to the step\'s round, the last one listed', () => {
    const width = jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(480)
    try {
      renderStep(steps.at(-1)!)
      expect(screen.getByRole('list').scrollLeft).toBe(480)
    } finally {
      width.mockRestore()
    }
  })

  it('shows a lone pick as locked in without revealing it', () => {
    const lone = { ...steps[1], state: steps[0].state, prevState: steps[0].state }
    const state = lone.state as { data: Record<string, unknown> }
    const step = { ...lone, state: { ...state, data: { ...state.data, playersReady: [ada.userId], playerChoices: { [ada.userId]: 'paper', [robo.userId]: null } } } }
    renderStep(step)
    expect(hand(ada.name)).toHaveAccessibleName(`${ada.name}: Locked in`)
    expect(document.body.textContent).not.toMatch(/paper/i)
    expect(document.querySelector('[data-icon="paper"]')).toBeNull()
  })

  it('colours the left seat with the page header\'s left accent', () => {
    renderStep(steps.at(-1)!)
    const header = getGameMetadata('rock_paper_scissors')!.accentColor
    expect(hand(ada.name).querySelector('.rps-hand')).toHaveStyle({ '--hand-accent': header })
  })

  it('renders nothing for a malformed state', () => {
    const { container } = renderStep({ ...steps[1], state: { data: { rounds: 'nope' } } })
    expect(container.firstChild).toBeNull()
  })
})
