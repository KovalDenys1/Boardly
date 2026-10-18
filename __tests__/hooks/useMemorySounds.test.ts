import { renderHook } from '@testing-library/react'
import { MATCH_POP_DELAY_MS, useMemorySounds, type UseMemorySoundsOptions } from '@/app/lobby/[code]/hooks/useMemorySounds'
import { REDUCED_MOTION_GAP_MS } from '@/lib/board-sounds'
import { prefersReducedMotion } from '@/lib/motion'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/lib/motion', () => ({ prefersReducedMotion: jest.fn(() => false) }))

const play = playCue as jest.Mock

type Card = { id: string; isFlipped: boolean; isMatched: boolean }
const board = (up: string[] = [], matched: string[] = []): Card[] =>
  ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((id) => ({ id, isFlipped: up.includes(id), isMatched: matched.includes(id) }))

function setup(initial: UseMemorySoundsOptions) {
  return renderHook((props: UseMemorySoundsOptions) => useMemorySounds(props), { initialProps: initial })
}

const me = { gameId: 'g1', viewerId: 'me', isSpectator: false }

describe('useMemorySounds (#1464)', () => {
  beforeEach(() => {
    play.mockClear()
    ;(prefersReducedMotion as jest.Mock).mockReturnValue(false)
  })

  it('stays silent for the board a page loads into, face-up and matched cards included', () => {
    const { rerender } = setup({ ...me, cards: [], currentPlayerId: null })
    rerender({ ...me, cards: board(['a1', 'b1', 'b2'], ['b1', 'b2']), currentPlayerId: 'opp' })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays the opponent’s flip at the remote level, once per card', () => {
    const { rerender } = setup({ ...me, cards: board(), currentPlayerId: 'opp' })
    rerender({ ...me, cards: board(['a1']), currentPlayerId: 'opp' })
    rerender({ ...me, cards: board(['a1']), currentPlayerId: 'opp' })
    expect(play.mock.calls).toEqual([['card.flip', { remote: true }]])
  })

  it('plays my own flip once at the click and keeps the server’s echo silent', () => {
    const { result, rerender } = setup({ ...me, cards: board(), currentPlayerId: 'me' })
    result.current.playOwnFlip('a1')
    rerender({ ...me, cards: board(['a1']), currentPlayerId: 'me' })
    expect(play.mock.calls).toEqual([['card.flip']])
  })

  it('plays my match as card.collect when the pop starts, and the opponent’s at the remote level', () => {
    const mine = setup({ ...me, cards: board(['a1']), currentPlayerId: 'me' })
    mine.result.current.playOwnFlip('a2')
    mine.rerender({ ...me, cards: board(['a1', 'a2'], ['a1', 'a2']), currentPlayerId: 'me' })
    expect(play.mock.calls).toEqual([['card.flip'], ['card.collect', { remote: false, delayMs: MATCH_POP_DELAY_MS }]])

    play.mockClear()
    const theirs = setup({ ...me, cards: board(['a1']), currentPlayerId: 'opp' })
    theirs.rerender({ ...me, cards: board(['a1', 'a2'], ['a1', 'a2']), currentPlayerId: 'opp' })
    expect(play.mock.calls).toEqual([['card.flip', { remote: true }], ['card.collect', { remote: true, delayMs: MATCH_POP_DELAY_MS }]])
  })

  it('plays card.down when a mismatch turns back, by whose turn it was before the turn passed', () => {
    const { rerender } = setup({ ...me, cards: board(['a1', 'b1']), currentPlayerId: 'opp' })
    rerender({ ...me, cards: board(), currentPlayerId: 'me' })
    expect(play.mock.calls).toEqual([['card.down', { remote: true }]])
  })

  it('forgets my flips with the game, so a rematch dealing the same card ids hears the opponent', () => {
    const { result, rerender } = setup({ ...me, cards: board(), currentPlayerId: 'me' })
    result.current.playOwnFlip('a1')
    rerender({ ...me, gameId: 'g2', cards: board(), currentPlayerId: 'opp' })
    rerender({ ...me, gameId: 'g2', cards: board(['a1']), currentPlayerId: 'opp' })
    expect(play.mock.calls).toEqual([['card.flip'], ['card.flip', { remote: true }]])
  })

  it('keeps the flip and the match in order, a short gap apart, under reduced motion', () => {
    ;(prefersReducedMotion as jest.Mock).mockReturnValue(true)
    const { rerender } = setup({ ...me, cards: board(['a1']), currentPlayerId: 'opp' })
    rerender({ ...me, cards: board(['a1', 'a2'], ['a1', 'a2']), currentPlayerId: 'opp' })
    expect(play.mock.calls).toEqual([
      ['card.flip', { remote: true, delayMs: 0 }],
      ['card.collect', { remote: true, delayMs: REDUCED_MOTION_GAP_MS }],
    ])
  })

  it('treats a jump bigger than one move as a snapshot catching up, and a spectator hears every move as remote', () => {
    const resync = setup({ ...me, cards: board(), currentPlayerId: 'opp' })
    resync.rerender({ ...me, cards: board(['a1', 'a2', 'b1'], ['a1', 'a2']), currentPlayerId: 'me' })
    expect(play).not.toHaveBeenCalled()

    const watcher = setup({ gameId: 'g1', viewerId: 'me', isSpectator: true, cards: board(['c1']), currentPlayerId: 'me' })
    watcher.rerender({ gameId: 'g1', viewerId: 'me', isSpectator: true, cards: board(['c1', 'c2'], ['c1', 'c2']), currentPlayerId: 'me' })
    expect(play.mock.calls).toEqual([['card.flip', { remote: true }], ['card.collect', { remote: true, delayMs: MATCH_POP_DELAY_MS }]])
  })
})
