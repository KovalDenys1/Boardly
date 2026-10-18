import { act, renderHook } from '@testing-library/react'
import { useFreshCue } from '@/hooks/useFreshCue'
import { useFreshKey } from '@/hooks/useFreshKey'

function useMarkCue({ moveKey, play }: { moveKey: string | null | undefined; play: () => void }) {
    const { fresh, settle } = useFreshKey(moveKey)
    useFreshCue(moveKey, fresh, play)
    return settle
}

describe('useFreshCue', () => {
    it('plays nothing for the snapshot a reload brings in, then once for the next move', () => {
        const play = jest.fn()
        const { rerender } = renderHook(useMarkCue, { initialProps: { moveKey: undefined as string | null | undefined, play } })
        rerender({ moveKey: '5:1000', play })
        rerender({ moveKey: '5:1000', play })
        expect(play).not.toHaveBeenCalled()

        rerender({ moveKey: '6:2000', play })
        expect(play).toHaveBeenCalledTimes(1)
    })

    it('plays a new move once, through re-renders with a new callback and the animation settling', () => {
        const play = jest.fn()
        const { result, rerender } = renderHook(useMarkCue, { initialProps: { moveKey: null as string | null | undefined, play: play as () => void } })
        rerender({ moveKey: '1:10', play: () => play() })
        rerender({ moveKey: '1:10', play: () => play() })
        act(() => result.current())
        rerender({ moveKey: '1:10', play: () => play() })
        expect(play).toHaveBeenCalledTimes(1)
    })

    it('does not replay a move when a rejected optimistic move rolls history back to it', () => {
        const play = jest.fn()
        const { rerender } = renderHook(({ moveKey }) => useFreshCue(moveKey, true, play, 'game-1'), { initialProps: { moveKey: 'K0' } })
        rerender({ moveKey: 'K1' })
        rerender({ moveKey: 'K0' })
        expect(play).toHaveBeenCalledTimes(2)
    })

    it('forgets the keys of a finished game when the next one starts', () => {
        const play = jest.fn()
        const { rerender } = renderHook(({ moveKey, scope }) => useFreshCue(moveKey, true, play, scope), { initialProps: { moveKey: '1:10', scope: 'game-1' } })
        rerender({ moveKey: '1:10', scope: 'game-2' })
        expect(play).toHaveBeenCalledTimes(2)
    })

    it('plays the first move of a game that loaded empty', () => {
        const play = jest.fn()
        const { rerender } = renderHook(useMarkCue, { initialProps: { moveKey: undefined as string | null | undefined, play } })
        rerender({ moveKey: null, play })
        rerender({ moveKey: '1:10', play })
        expect(play).toHaveBeenCalledTimes(1)
    })
})
