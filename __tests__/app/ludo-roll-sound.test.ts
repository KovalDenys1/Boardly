import { renderHook } from '@testing-library/react'
import { useLudoRollSound, type LudoRollLike } from '@/app/lobby/[code]/hooks/useLudoRollSound'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

type Roll = LudoRollLike | null | undefined
const mount = (viewer = 'me', spectator = false) =>
    renderHook(({ roll }: { roll: Roll }) => useLudoRollSound(roll, viewer, spectator, 'game-1'), { initialProps: { roll: undefined as Roll } })
const calls = () => play.mock.calls.map(([cue, options]) => [cue, options?.remote ?? false])

beforeEach(() => play.mockClear())

describe('useLudoRollSound', () => {
    it('throws on the viewer’s tap and does not play the same roll again when the server answers', () => {
        const { result, rerender } = mount()
        rerender({ roll: null })
        result.current.tapped()
        expect(calls()).toEqual([['die.roll', false]])
        rerender({ roll: { playerId: 'me', at: 1 } })
        expect(play).toHaveBeenCalledTimes(1)
    })

    it('plays a roll the server made for the viewer, a timeout, at the viewer’s level', () => {
        const { rerender } = mount()
        rerender({ roll: null })
        rerender({ roll: { playerId: 'me', at: 1 } })
        expect(calls()).toEqual([['die.roll', false]])
    })

    it('plays someone else’s roll at the remote level, and every roll for a spectator', () => {
        const player = mount()
        player.rerender({ roll: null })
        player.rerender({ roll: { playerId: 'bot', at: 1 } })
        const spectator = mount('me', true)
        spectator.rerender({ roll: null })
        spectator.rerender({ roll: { playerId: 'me', at: 2 } })
        expect(calls()).toEqual([['die.roll', true], ['die.roll', true]])
    })

    it('forgets a tap whose roll was never sent, so the next roll the viewer gets is heard', () => {
        const { result, rerender } = mount()
        rerender({ roll: null })
        result.current.tapped()
        result.current.failed()
        rerender({ roll: { playerId: 'me', at: 1 } })
        expect(calls()).toEqual([['die.roll', false], ['die.roll', false]])
    })

    it('plays nothing for the roll a reload brings in', () => {
        const { rerender } = mount()
        rerender({ roll: { playerId: 'bot', at: 1 } })
        rerender({ roll: { playerId: 'bot', at: 1 } })
        expect(play).not.toHaveBeenCalled()
    })
})
