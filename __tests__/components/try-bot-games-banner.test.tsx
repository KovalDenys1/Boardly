import { act, render, screen } from '@testing-library/react'
import TryBotGamesBanner from '@/app/lobby/[code]/components/TryBotGamesBanner'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('TryBotGamesBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('does not render before the suggestion delay has elapsed', () => {
    render(<TryBotGamesBanner waitingSinceMs={Date.now()} />)

    expect(screen.queryByText('game.ui.tryBotGamesTitle')).toBeNull()
  })

  it('renders bot-capable game suggestions once the delay elapses', () => {
    render(<TryBotGamesBanner waitingSinceMs={Date.now()} />)

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(screen.queryByText('game.ui.tryBotGamesTitle')).not.toBeNull()
    expect(screen.queryByText('Yahtzee')).not.toBeNull()
  })

  it('renders immediately if the wait already exceeds the delay', () => {
    render(<TryBotGamesBanner waitingSinceMs={Date.now() - 120_000} />)

    expect(screen.queryByText('game.ui.tryBotGamesTitle')).not.toBeNull()
  })

  it('hides after dismiss is clicked', () => {
    render(<TryBotGamesBanner waitingSinceMs={Date.now() - 120_000} />)

    act(() => {
      screen.getByLabelText('common.close').click()
    })

    expect(screen.queryByText('game.ui.tryBotGamesTitle')).toBeNull()
  })
})
