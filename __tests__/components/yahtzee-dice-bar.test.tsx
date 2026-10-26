import { fireEvent, render, screen } from '@testing-library/react'
import YahtzeeDiceBar from '@/components/yahtzee/YahtzeeDiceBar'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

function renderBar(held: boolean[]) {
  const onToggleHold = jest.fn()
  const onRoll = jest.fn()
  render(
    <YahtzeeDiceBar
      dice={[1, 2, 3, 4, 5]}
      held={held}
      rollsLeft={2}
      placeholder={false}
      isRolling={false}
      canHold
      canRoll
      onToggleHold={onToggleHold}
      onRoll={onRoll}
    />,
  )
  return { onToggleHold, onRoll }
}

describe('YahtzeeDiceBar sound (#1464)', () => {
  beforeEach(() => play.mockClear())

  it('knocks die.hold at its pitch for a hold, a step lower for a release', () => {
    const { onToggleHold } = renderBar([false, true, false, false, false])
    const dice = screen.getAllByRole('button', { pressed: false })
    fireEvent.click(dice[0])
    fireEvent.click(screen.getByRole('button', { pressed: true }))
    expect(play.mock.calls).toEqual([
      ['die.hold', { semis: 0 }],
      ['die.hold', { semis: -3 }],
    ])
    expect(onToggleHold).toHaveBeenCalledTimes(2)
  })

  it('leaves the roll sound to the roll itself, so one press is one sound', () => {
    const { onRoll } = renderBar([false, false, false, false, false])
    fireEvent.click(screen.getByRole('button', { name: /yahtzee.ui.rollDice/ }))
    expect(onRoll).toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
})
