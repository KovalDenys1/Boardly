import { isTerminalGameStatus, resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'

describe('lobby lifecycle helpers', () => {
  it('detects terminal game statuses', () => {
    expect(isTerminalGameStatus('abandoned')).toBe(true)
    expect(isTerminalGameStatus('cancelled')).toBe(true)
    expect(isTerminalGameStatus('finished')).toBe(false)
    expect(isTerminalGameStatus('playing')).toBe(false)
  })

  it('returns local terminal redirect reason for terminal game statuses', () => {
    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'abandoned',
        lobbyIsActive: true,
      })
    ).toBe('local-game-status:abandoned')

    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'cancelled',
        lobbyIsActive: true,
      })
    ).toBe('local-game-status:cancelled')
  })

  it('returns local inactive redirect reason when lobby is inactive and there is no settled game to show', () => {
    expect(
      resolveLifecycleRedirectReason({
        gameStatus: null,
        lobbyIsActive: false,
      })
    ).toBe('local-lobby-inactive')
  })

  it('does not redirect while game is active or finished even if lobby flag is false', () => {
    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'playing',
        lobbyIsActive: false,
      })
    ).toBeNull()

    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'waiting',
        lobbyIsActive: false,
      })
    ).toBeNull()

    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'finished',
        lobbyIsActive: false,
      })
    ).toBeNull()
  })
})
