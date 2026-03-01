import { act, render, screen } from '@testing-library/react'
import PlayerList from '@/components/PlayerList'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}))

interface TestPlayerOptions {
  id: string
  userId?: string
  score: number
  position?: number
}

function makePlayer(options: TestPlayerOptions) {
  return {
    id: options.id,
    userId: options.userId || options.id,
    score: options.score,
    position: options.position ?? 0,
    isReady: true,
    user: {
      username: options.id,
      email: `${options.id}@example.com`,
      name: options.id,
      bot: null,
    },
  }
}

describe('PlayerList score animation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('animates score change after player id swap with equal score', () => {
    const { rerender } = render(
      <PlayerList players={[makePlayer({ id: 'p1', score: 5 })]} currentTurn={0} />
    )

    expect(screen.queryByText('✨')).toBeNull()

    rerender(<PlayerList players={[makePlayer({ id: 'p2', score: 5 })]} currentTurn={0} />)
    rerender(<PlayerList players={[makePlayer({ id: 'p2', score: 8 })]} currentTurn={0} />)

    expect(screen.queryByText('✨')).not.toBeNull()
  })

  it('clears score animation marker after timeout', () => {
    const { rerender } = render(
      <PlayerList players={[makePlayer({ id: 'p1', score: 1 })]} currentTurn={0} />
    )

    rerender(<PlayerList players={[makePlayer({ id: 'p1', score: 2 })]} currentTurn={0} />)
    expect(screen.queryByText('✨')).not.toBeNull()

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(screen.queryByText('✨')).toBeNull()
  })
})
