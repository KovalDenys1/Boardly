import { act, renderHook } from '@testing-library/react'
import { useSketchSounds, type SketchSnapshot } from '@/app/lobby/[code]/hooks/useSketchSounds'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

const snap = (guessed: string[] = [], phase = 'drawing', round = 1): SketchSnapshot => ({ round, phase, guessed })

function setup(initial: SketchSnapshot | null, { viewerId = 'me', isSpectator = false } = {}) {
  return renderHook((snapshot: SketchSnapshot | null) => useSketchSounds(snapshot, { gameId: 'g1', viewerId, isSpectator }), { initialProps: initial })
}

describe('useSketchSounds (#1464)', () => {
  beforeEach(() => play.mockClear())

  it('stays silent for the round a reload lands in, guesses and reveal included', () => {
    const { rerender } = setup(null)
    rerender(snap(['a', 'me'], 'reveal'))
    expect(play).not.toHaveBeenCalled()
  })

  it('plays someone else’s correct guess as a remote score.add, once', () => {
    const { rerender } = setup(snap())
    rerender(snap(['a']))
    rerender(snap(['a']))
    expect(play.mock.calls).toEqual([['score.add', { remote: true }]])
  })

  it('plays my correct guess once, whether the server’s answer or the state echo comes first', () => {
    const answerFirst = setup(snap())
    act(() => answerFirst.result.current.playGuessResult({ correct: true, close: false }))
    answerFirst.rerender(snap(['me']))
    expect(play.mock.calls).toEqual([['guess.correct']])

    play.mockClear()
    const echoFirst = setup(snap())
    echoFirst.rerender(snap(['me']))
    act(() => echoFirst.result.current.playGuessResult({ correct: true, close: false }))
    expect(play.mock.calls).toEqual([['guess.correct', undefined]])
  })

  it('plays guess.close for a near miss', () => {
    const { result } = setup(snap())
    act(() => result.current.playGuessResult({ correct: false, close: true }))
    expect(play.mock.calls).toEqual([['guess.close']])
  })

  it('plays the host’s accept once the server takes it, however the echo and the answer interleave, and as my correct guess for the player accepted', async () => {
    const host = setup(snap())
    await act(() => host.result.current.acceptAloud('a', async () => true))
    host.rerender(snap(['a']))
    expect(play.mock.calls).toEqual([['score.add']])

    play.mockClear()
    const echoFirst = setup(snap())
    let answer: (accepted: boolean) => void = () => {}
    let accepting: Promise<void> = Promise.resolve()
    act(() => {
      accepting = echoFirst.result.current.acceptAloud('a', () => new Promise<boolean>((resolve) => { answer = resolve }))
    })
    echoFirst.rerender(snap(['a']))
    expect(play).not.toHaveBeenCalled()
    await act(async () => {
      answer(true)
      await accepting
    })
    expect(play.mock.calls).toEqual([['score.add']])

    play.mockClear()
    const refused = setup(snap())
    await act(() => refused.result.current.acceptAloud('a', async () => false))
    refused.rerender(snap(['a']))
    expect(play.mock.calls).toEqual([['score.add', { remote: true }]])

    play.mockClear()
    const accepted = setup(snap())
    accepted.rerender(snap(['me']))
    expect(play.mock.calls).toEqual([['guess.correct', undefined]])
  })

  it('plays round.end at the reveal, after the guess that closed the round, and nothing for a new round', () => {
    const { rerender } = setup(snap(['a']))
    rerender(snap(['a', 'b'], 'reveal'))
    rerender(snap([], 'choosing', 2))
    expect(play.mock.calls).toEqual([['score.add', { remote: true }], ['round.end', { delayMs: 150 }]])
  })

  it('hears a rematch in the same page from its first round: the last game’s guesses are forgotten with it', () => {
    const { result, rerender } = renderHook(
      ({ snapshot, gameId }: { snapshot: SketchSnapshot | null; gameId: string }) => useSketchSounds(snapshot, { gameId, viewerId: 'me', isSpectator: false }),
      { initialProps: { snapshot: snap() as SketchSnapshot | null, gameId: 'g1' } },
    )
    act(() => result.current.playGuessResult({ correct: true, close: false }))
    rerender({ snapshot: snap(['me']), gameId: 'g1' })
    rerender({ snapshot: snap(['a', 'me']), gameId: 'g1' })
    rerender({ snapshot: null, gameId: 'g1' })
    rerender({ snapshot: snap([], 'choosing', 1), gameId: 'g2' })
    rerender({ snapshot: snap([], 'drawing', 1), gameId: 'g2' })
    play.mockClear()
    act(() => result.current.playGuessResult({ correct: true, close: false }))
    rerender({ snapshot: snap(['me']), gameId: 'g2' })
    rerender({ snapshot: snap(['a', 'me']), gameId: 'g2' })
    expect(play.mock.calls).toEqual([['guess.correct'], ['score.add', { remote: true }]])
  })

  it('gives a spectator every correct guess as remote and the reveal', () => {
    const { rerender } = setup(snap(), { viewerId: 'me', isSpectator: true })
    rerender(snap(['me']))
    rerender(snap(['me'], 'reveal'))
    expect(play.mock.calls).toEqual([['score.add', { remote: true }], ['round.end', undefined]])
  })
})
