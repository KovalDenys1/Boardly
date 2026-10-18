import { useLayoutEffect } from 'react'
import { renderHook } from '@testing-library/react'
import { useTurnSounds, TURN_AFTER_MOVE_MS, turnCameToViewer, type UseTurnSoundsOptions } from '@/hooks/useTurnSounds'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

function setup(initial: UseTurnSoundsOptions) {
  return renderHook((props: UseTurnSoundsOptions) => useTurnSounds(props), { initialProps: initial })
}

describe('useTurnSounds (#1111, #1464)', () => {
  beforeEach(() => play.mockClear())

  it('plays nothing on the first render, even when it is already my turn', () => {
    setup({ isMyTurn: true, lastMoveSignature: 3, opponentMoved: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays turn.mine when the turn comes to the viewer, once', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1 })
    rerender({ isMyTurn: true, lastMoveSignature: 1 })
    expect(play.mock.calls).toEqual([['turn.mine', { delayMs: TURN_AFTER_MOVE_MS }]])
    rerender({ isMyTurn: true, lastMoveSignature: 1 })
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('does not play when the turn leaves the viewer (their own move)', () => {
    const { rerender } = setup({ isMyTurn: true, lastMoveSignature: 1, opponentMoved: false })
    rerender({ isMyTurn: false, lastMoveSignature: 2, opponentMoved: false })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays the move cue at the remote level for an opponent move that keeps the turn away', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1, moveCue: 'tap.mark' })
    rerender({ isMyTurn: false, lastMoveSignature: 2, opponentMoved: true, moveCue: 'tap.mark' })
    expect(play.mock.calls).toEqual([['tap.mark', { remote: true }]])
  })

  it('plays the opponent move, then turn.mine 150 ms later, when one move does both', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 4, moveCue: 'piece.place' })
    rerender({ isMyTurn: true, lastMoveSignature: 5, opponentMoved: true, moveCue: 'piece.place' })
    expect(play.mock.calls).toEqual([
      ['piece.place', { remote: true }],
      ['turn.mine', { delayMs: 150 }],
    ])
  })

  it('plays only turn.mine, after turnDelayMs, when the page plays the move itself (moveCue null)', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 4, moveCue: null, turnDelayMs: 450 })
    rerender({ isMyTurn: true, lastMoveSignature: 5, opponentMoved: true, moveCue: null, turnDelayMs: 450 })
    expect(play.mock.calls).toEqual([['turn.mine', { delayMs: 450 }]])
  })

  it('reads a delay function when the turn arrives, after the layout effect that planned the move', () => {
    const landing = { current: 0 }
    const { rerender } = renderHook(
      ({ turn, signature, plannedMs }: { turn: boolean; signature: number; plannedMs: number }) => {
        useLayoutEffect(() => {
          landing.current = plannedMs
        }, [plannedMs])
        useTurnSounds({ isMyTurn: turn, lastMoveSignature: signature, moveCue: null, turnDelayMs: () => landing.current + TURN_AFTER_MOVE_MS })
      },
      { initialProps: { turn: false, signature: 4, plannedMs: 0 } },
    )
    rerender({ turn: true, signature: 5, plannedMs: 220 })
    expect(play.mock.calls).toEqual([['turn.mine', { delayMs: 220 + TURN_AFTER_MOVE_MS }]])
  })

  it('maps an old moveSound name to its cue when no moveCue is given', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 'a', moveSound: 'score' })
    rerender({ isMyTurn: false, lastMoveSignature: 'b', opponentMoved: true, moveSound: 'score' })
    expect(play).toHaveBeenCalledWith('score.add', { remote: true })
  })

  it('defaults the move cue to the old click, ui.select', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1 })
    rerender({ isMyTurn: false, lastMoveSignature: 2, opponentMoved: true })
    expect(play).toHaveBeenCalledWith('ui.select', { remote: true })
  })

  it('stays silent while disabled and does not replay stale changes when re-enabled', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: 1, enabled: false })
    rerender({ isMyTurn: true, lastMoveSignature: 2, opponentMoved: true, enabled: false })
    expect(play).not.toHaveBeenCalled()
    rerender({ isMyTurn: true, lastMoveSignature: 2, opponentMoved: true, enabled: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('treats the game loading in (signature from null) as a snapshot, not a move', () => {
    const { rerender } = setup({ isMyTurn: false, lastMoveSignature: null })
    rerender({ isMyTurn: true, lastMoveSignature: 7, opponentMoved: true })
    expect(play).not.toHaveBeenCalled()
    rerender({ isMyTurn: false, lastMoveSignature: 8, opponentMoved: false })
    rerender({ isMyTurn: true, lastMoveSignature: 9, opponentMoved: true })
    expect(play).toHaveBeenCalledWith('turn.mine', { delayMs: TURN_AFTER_MOVE_MS })
  })
})

describe('turnCameToViewer (the lobby shell turn cue, #1464)', () => {
  it('is true only when the turn moves to the viewer', () => {
    expect(turnCameToViewer('bot', 'me', 'me')).toBe(true)
  })

  it('stays silent when the turn moves away from the viewer', () => {
    expect(turnCameToViewer('me', 'bot', 'me')).toBe(false)
  })

  it('stays silent between two other players, on the first observation and with no viewer', () => {
    expect(turnCameToViewer('a', 'b', 'me')).toBe(false)
    expect(turnCameToViewer(undefined, 'me', 'me')).toBe(false)
    expect(turnCameToViewer('me', 'me', 'me')).toBe(false)
    expect(turnCameToViewer('bot', 'me', null)).toBe(false)
  })
})
