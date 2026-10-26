import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import LudoReplayRenderer from '@/components/replay/LudoReplayRenderer'
import { LUDO_FINISH, LUDO_YARD, type LudoGameData } from '@/lib/games/ludo-game'
import { LUDO_YARD_ORIGIN, ludoTokenPoint } from '@/lib/games/ludo-layout'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayPlayer, ReplaySnapshotInput, ReplayStep } from '@/lib/replay/types'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))

const fixture: { players: ReplayPlayer[]; snapshots: ReplaySnapshotInput[] } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', 'ludo.json'), 'utf-8'),
)
const steps = groupSteps('ludo', fixture.snapshots)
const nameById = new Map(fixture.players.map((p) => [p.userId, p.name]))
const dataOf = (step: ReplayStep) => (step.state as { data: LudoGameData }).data
const [ada, robo] = fixture.players

function renderStep(step: ReplayStep) {
  return render(
    <LudoReplayRenderer
      step={step}
      isFinalStep={step === steps.at(-1)}
      seats={fixture.players}
      playerNameById={nameById}
      viewerId={ada.userId}
    />,
  )
}

const translateOf = (point: { x: number; y: number }) => `translate(${point.x}px, ${point.y}px)`
const tokenLabel = (color: string, number: number) =>
  `games.ludo.game.tokenLabel ${JSON.stringify({ color: `games.ludo.colors.${color}`, number })}`

describe('LudoReplayRenderer', () => {
  it('draws every token in its yard on game:start, with no highlight, no die and nothing to press', () => {
    expect(steps[0].action).toBe('game:start')
    const { container } = renderStep(steps[0])
    const tokens = container.querySelectorAll('.ludo-token')
    expect(tokens).toHaveLength(4)
    for (const seat of dataOf(steps[0]).seats) {
      for (const token of [0, 1]) {
        const el = container.querySelector(`[aria-label='${tokenLabel(seat.color, token + 1)}']`)
        expect(el?.getAttribute('style')).toContain(translateOf(ludoTokenPoint(seat.color, LUDO_YARD, token)))
      }
    }
    expect(container.querySelector('.ludo-token--last')).toBeNull()
    expect(container.querySelector('[data-testid="ludo-replay-die"]')).toBeNull()
    expect(container.querySelectorAll('[tabindex], [role="button"], .ludo-token--selectable')).toHaveLength(0)
  })

  it('marks the token a capture moved, shows the die it rolled and puts the captured token back in its yard', () => {
    const capture = steps.find((s) => s.actorId === ada.userId && dataOf(s).lastMove?.captured.length && s.action === 'move')!
    const { lastMove, lastRoll, seats } = dataOf(capture)
    const victim = lastMove!.captured[0]
    const victimColor = seats.find((seat) => seat.playerId === victim.playerId)!.color
    expect(victim.playerId).toBe(robo.userId)

    const { container } = renderStep(capture)

    const last = container.querySelectorAll('.ludo-token--last')
    expect(last).toHaveLength(1)
    expect(last[0].getAttribute('aria-label')).toBe(tokenLabel('red', lastMove!.token + 1))
    expect(last[0].querySelector('.ludo-token__last')).not.toBeNull()
    expect(last[0].getAttribute('style')).toContain(translateOf(ludoTokenPoint('red', lastMove!.to, lastMove!.token)))

    const victimEl = container.querySelector(`[aria-label='${tokenLabel(victimColor, victim.token + 1)}']`)
    expect(victimEl?.getAttribute('style')).toContain(translateOf(ludoTokenPoint(victimColor, LUDO_YARD, victim.token)))

    const die = container.querySelector<HTMLElement>('[data-testid="ludo-replay-die"]')!
    expect(die.dataset.value).toBe(String(lastRoll!.value))
    expect(die.style.top).toBe('3px')
    expect(die.style.left).toBe('3px')
    expect(container.querySelectorAll('[tabindex], [role="button"]')).toHaveLength(0)
  })

  it('names the winner on the final step, with all their tokens home', () => {
    const final = steps.at(-1)!
    const { container } = renderStep(final)
    const group = container.querySelector('[data-testid="ludo-replay"]')!
    expect(group.getAttribute('data-winner-id')).toBe(ada.userId)
    expect(group.getAttribute('aria-label')).toContain('"player":"Ada"')
    expect(dataOf(final).tokens[ada.userId]).toEqual([LUDO_FINISH, LUDO_FINISH])
    expect(container.querySelectorAll('.ludo-token--last')).toHaveLength(1)
  })

  it('names no winner before the final step', () => {
    const { container } = renderStep(steps[Math.floor(steps.length / 2)])
    expect(container.querySelector('[data-testid="ludo-replay"]')!.hasAttribute('data-winner-id')).toBe(false)
  })

  it('skips a token whose position is off the board instead of throwing', () => {
    const data = dataOf(steps[0])
    const state = { ...(steps[0].state as object), data: { ...data, tokens: { ...data.tokens, [ada.userId]: [-2, LUDO_FINISH + 1] } } }
    const { container } = renderStep({ ...steps[0], state })
    expect(container.querySelectorAll('.ludo-token')).toHaveLength(2)
  })

  it('puts the die on the outer corner of each colour\'s yard', () => {
    const colors = ['red', 'green', 'yellow', 'blue'] as const
    const seats = colors.map((color, i) => ({ playerId: `p${i}`, color }))
    const tokens = Object.fromEntries(seats.map((seat) => [seat.playerId, [LUDO_YARD, LUDO_YARD]]))
    for (const seat of seats) {
      const [row, col] = LUDO_YARD_ORIGIN[seat.color]
      const state = { status: 'playing', data: { seats, tokens, lastMove: null, lastRoll: { playerId: seat.playerId, value: 4, at: 1 } } }
      const { container, unmount } = renderStep({ ...steps[1], state })
      const die = container.querySelector<HTMLElement>('[data-testid="ludo-replay-die"]')!
      expect(die.style[row === 0 ? 'top' : 'bottom']).toBe('3px')
      expect(die.style[col === 0 ? 'left' : 'right']).toBe('3px')
      expect(die.style[row === 0 ? 'bottom' : 'top']).toBe('')
      expect(die.style[col === 0 ? 'right' : 'left']).toBe('')
      unmount()
    }
  })

  it('renders nothing for a malformed state instead of throwing', () => {
    for (const state of [null, {}, { data: { seats: 'x', tokens: {} } }, { data: { seats: [{ playerId: 'a', color: 'pink' }], tokens: {} } }]) {
      const { container } = renderStep({ ...steps[1], state })
      expect(container.innerHTML).toBe('')
    }
  })
})
