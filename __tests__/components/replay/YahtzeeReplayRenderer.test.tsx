import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import YahtzeeReplayRenderer from '@/components/replay/YahtzeeReplayRenderer'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'
import { calculateTotalScore, type YahtzeeScorecard } from '@/lib/yahtzee'

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
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'yahtzee.json'), 'utf-8'),
)
const steps = groupSteps('yahtzee', fixture.snapshots)
const playerNameById = new Map(fixture.players.map((p) => [p.userId, p.name]))

type YState = { status: string; currentPlayerIndex: number; players: { id: string }[]; data: { dice: number[]; held: boolean[]; rollsLeft: number; scores: YahtzeeScorecard[] } }
const stateOf = (step: ReplayStep) => step.state as YState
const middle = steps.slice(Math.floor(steps.length / 2)).find((s) => {
  const { held, rollsLeft } = stateOf(s).data
  return held.some(Boolean) && held.some((h) => !h) && rollsLeft < 3
})!

function renderStep(step: ReplayStep, viewerId = fixture.players[0].userId) {
  return render(
    <YahtzeeReplayRenderer
      step={step}
      isFinalStep={step === steps.at(-1)}
      seats={fixture.players}
      playerNameById={playerNameById}
      viewerId={viewerId}
    />,
  )
}

const dice = () => document.querySelectorAll('.yz-die')
const pill = (name: RegExp) => within(screen.getByRole('group', { name: /scores/i })).getByRole('button', { name })

describe('YahtzeeReplayRenderer', () => {
  it('opens on five unheld dice, three rolls and zero for every seat', () => {
    renderStep(steps[0])
    expect(dice()).toHaveLength(5)
    expect(document.querySelectorAll('.yz-die--held')).toHaveLength(0)
    expect(screen.getByTestId('yahtzee-replay-rolls')).toHaveTextContent('3')
    expect(screen.queryByRole('button', { name: /roll dice/i })).toBeNull()
    for (const player of fixture.players) expect(pill(new RegExp(`${player.seat === 0 ? 'You' : player.name}.*\\b0\\b`))).toBeInTheDocument()
    expect(document.querySelectorAll('[data-state="scored"]')).toHaveLength(0)
  })

  it('marks the held dice of a middle step and shows its rolls left', () => {
    renderStep(middle)
    const { held, rollsLeft, dice: values } = stateOf(middle).data
    held.forEach((isHeld, index) => {
      expect(dice()[index]).toHaveAttribute('aria-pressed', String(isHeld))
      expect(dice()[index]).toHaveAccessibleName(new RegExp(`\\b${values[index]}\\b`))
    })
    expect(screen.getByTestId('yahtzee-replay-rolls')).toHaveTextContent(String(rollsLeft))
  })

  it('shows the dice that were scored on a score step, not the next turn\'s fresh roll', () => {
    const step = steps.find((s) => s.action === 'score' && s.index > 0 && stateOf(s).status === 'playing')!
    const before = stateOf({ ...step, state: step.prevState }).data
    renderStep(step)
    before.dice.forEach((value, index) => expect(dice()[index]).toHaveAccessibleName(new RegExp(`\\b${value}\\b`)))
    expect(screen.getByTestId('yahtzee-replay-rolls')).toHaveTextContent(String(before.rollsLeft))
  })

  it('puts the turn dot on players[currentPlayerIndex]', () => {
    const step = steps.find((s) => s.index > 0 && stateOf(s).currentPlayerIndex === 1 && stateOf(s).status === 'playing')!
    renderStep(step)
    const robo = fixture.players[1]
    expect(pill(new RegExp(robo.name)).querySelector('.yz-pill__turn')).not.toBeNull()
    expect(pill(/You/).querySelector('.yz-pill__turn')).toBeNull()
  })

  it('ends on the final totals and the scorer card, and a pill switches the card', () => {
    const final = steps.at(-1)!
    const { scores } = stateOf(final).data
    expect(stateOf(final).status).toBe('finished')
    renderStep(final)
    const robo = fixture.players[1]
    expect(pill(/You/)).toHaveAccessibleName(new RegExp(`\\b${calculateTotalScore(scores[0])}\\b`))
    expect(pill(new RegExp(robo.name))).toHaveAccessibleName(new RegExp(`\\b${calculateTotalScore(scores[1])}\\b`))
    const scorer = fixture.players.findIndex((p) => p.userId === final.actorId)
    const filled = (card: YahtzeeScorecard) => Object.values(card).filter((v) => typeof v === 'number').length
    expect(document.querySelectorAll('[data-state="scored"]')).toHaveLength(filled(scores[scorer]))
    const other = 1 - scorer
    fireEvent.click(pill(other === 0 ? /You/ : new RegExp(robo.name)))
    expect(document.querySelectorAll('[data-state="scored"]')).toHaveLength(filled(scores[other]))
  })

  it('goes back to following the actor once the step changes after a pill was picked', () => {
    const ada = fixture.players[0]
    const target = steps.find((s) => s.action === 'score' && s.actorId === ada.userId && stateOf(s).status === 'playing')!
    const view = renderStep(steps[0])
    fireEvent.click(pill(new RegExp(fixture.players[1].name)))
    view.rerender(
      <YahtzeeReplayRenderer step={target} isFinalStep={false} seats={fixture.players} playerNameById={playerNameById} viewerId={ada.userId} />,
    )
    const filled = (seat: number) => Object.values(stateOf(target).data.scores[seat] ?? {}).filter((v) => typeof v === 'number').length
    expect(filled(0)).not.toBe(filled(1))
    expect(document.querySelectorAll('[data-state="scored"]')).toHaveLength(filled(0))
  })

  it('renders nothing for a malformed state', () => {
    const { container } = renderStep({ ...steps[1], state: { data: { dice: 'nope' } } })
    expect(container.firstChild).toBeNull()
  })
})
