import { renderHook } from '@testing-library/react'
import { useTurnSounds, OPPONENT_MOVE_VOLUME_FACTOR, type UseTurnSoundsOptions } from '@/hooks/useTurnSounds'
import { sounds } from '@/lib/sounds'

jest.mock('@/lib/sounds', () => ({
  sounds: {
    play: jest.fn(),
    hasUserInteracted: jest.fn(() => true),
    getVolume: jest.fn(() => 0.5),
  },
}))

const play = sounds.play as jest.Mock
const hasUserInteracted = sounds.hasUserInteracted as jest.Mock

function setup(initial: UseTurnSoundsOptions) {
  return renderHook((props: UseTurnSoundsOptions) => useTurnSounds(props), { initialProps: initial })
}

describe('useTurnSounds (#1111)', () => {
  beforeEach(() => {
    play.mockClear()
    hasUserInteracted.mockReturnValue(true)
  })

  it('plays nothing on the first render, even when it is already my turn', () => {
    setup({ isMyTurn: true, lastMoveSignature: 3, opponentMoved: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays turnChange when the turn comes to the viewer, once', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1 })
    rerender({ isMyTurn: true, lastMoveSignature: 1 })
    expect(play).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith('turnChange')
    rerender({ isMyTurn: true, lastMoveSignature: 1 })
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('does not play when the turn leaves the viewer (their own move)', () => {
    const { rerender } = setup({ isMyTurn: true, lastMoveSignature: 1, opponentMoved: false })
    rerender({ isMyTurn: false, lastMoveSignature: 2, opponentMoved: false })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays a quieter move cue for an opponent move that keeps the turn away', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1, opponentMoved: false })
    rerender({ isMyTurn: false, lastMoveSignature: 2, opponentMoved: true })
    expect(play).toHaveBeenCalledWith('click', { volume: 0.5 * OPPONENT_MOVE_VOLUME_FACTOR })
  })

  it('plays only turnChange when an opponent move also hands the turn over', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 4, opponentMoved: false })
    rerender({ isMyTurn: true, lastMoveSignature: 5, opponentMoved: true })
    expect(play).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith('turnChange')
  })

  it('uses a custom move sound', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 'a', moveSound: 'cardFlip' })
    rerender({ isMyTurn: false, lastMoveSignature: 'b', opponentMoved: true, moveSound: 'cardFlip' })
    expect(play).toHaveBeenCalledWith('cardFlip', expect.any(Object))
  })

  it('stays silent while disabled and does not replay stale changes when re-enabled', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1, enabled: false })
    rerender({ isMyTurn: true, lastMoveSignature: 2, opponentMoved: true, enabled: false })
    expect(play).not.toHaveBeenCalled()
    rerender({ isMyTurn: true, lastMoveSignature: 2, opponentMoved: true, enabled: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('stays silent before the user has interacted with the page', () => {
    hasUserInteracted.mockReturnValue(false)
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1 })
    rerender({ isMyTurn: true, lastMoveSignature: 2, opponentMoved: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('treats the game loading in (signature from null) as a snapshot, not a move', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: null })
    rerender({ isMyTurn: true, lastMoveSignature: 7, opponentMoved: true })
    expect(play).not.toHaveBeenCalled()
    rerender({ isMyTurn: false, lastMoveSignature: 8, opponentMoved: false })
    rerender({ isMyTurn: true, lastMoveSignature: 9, opponentMoved: true })
    expect(play).toHaveBeenCalledWith('turnChange')
  })
})
