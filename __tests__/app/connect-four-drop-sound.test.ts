import { act, renderHook } from '@testing-library/react'
import { useConnectFourDropSound, type ConnectFourDrop } from '@/app/lobby/[code]/hooks/useConnectFourDropSound'
import { useFreshKey } from '@/hooks/useFreshKey'
import { C4_DEFAULT_CELL_PX, c4LandingMs } from '@/lib/connect-four-drop-timing'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock
let reducedMotion = false

beforeAll(() => {
    window.matchMedia = ((query: string) => ({ matches: reducedMotion && query.includes('reduce'), media: query })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
    jest.useFakeTimers()
    play.mockClear()
    reducedMotion = false
})

afterEach(() => jest.useRealTimers())

const tick = (ms: number) => act(() => {
    jest.advanceTimersByTime(ms)
})

interface Props {
    dropKey: string | null | undefined
    drop: ConnectFourDrop | null
}

// The page's wiring, with no board rendered at all: the landing is timed from state alone.
function useDrops({ dropKey, drop }: Props) {
    const { fresh } = useFreshKey(dropKey)
    return useConnectFourDropSound(dropKey, fresh, drop, 'game-1')
}

const mount = () => renderHook(useDrops, { initialProps: { dropKey: undefined, drop: null } as Props })

describe('useConnectFourDropSound', () => {
    it('lands a fresh drop at its fall time with no board mounted, the opponent’s at the remote level', () => {
        const { rerender } = mount()
        rerender({ dropKey: null, drop: null })
        rerender({ dropKey: '1:100', drop: { row: 5, remote: true } })

        const landing = c4LandingMs(5, C4_DEFAULT_CELL_PX)
        tick(landing - 1)
        expect(play).not.toHaveBeenCalled()
        tick(1)
        expect(play.mock.calls).toEqual([['piece.place', { remote: true, semis: undefined }]])
    })

    it('still lands the first drop when a second one supersedes it mid-fall', () => {
        const { rerender } = mount()
        rerender({ dropKey: null, drop: null })
        rerender({ dropKey: '1:100', drop: { row: 5, remote: false } })
        tick(50)
        rerender({ dropKey: '2:200', drop: { row: 4, remote: true } })
        tick(1000)
        expect(play.mock.calls.map(([cue, options]) => [cue, options.remote])).toEqual([
            ['piece.place', false],
            ['piece.place', true],
        ])
    })

    it('times the landing from the cell size the board last measured', () => {
        const { result, rerender } = mount()
        rerender({ dropKey: null, drop: null })
        result.current.onCellMeasured(60)
        rerender({ dropKey: '1:100', drop: { row: 2, remote: true } })
        tick(c4LandingMs(2, 60) - 1)
        expect(play).not.toHaveBeenCalled()
        tick(1)
        expect(play).toHaveBeenCalledTimes(1)
        expect(result.current.landingMs(2)).toBe(c4LandingMs(2, 60))
    })

    it('plays nothing for the drop a reload brings in', () => {
        const { rerender } = mount()
        rerender({ dropKey: '7:700', drop: { row: 0, remote: true } })
        tick(2000)
        expect(play).not.toHaveBeenCalled()
    })

    it('lands at once under reduced motion, and cancels a pending landing on unmount', () => {
        reducedMotion = true
        const reduced = mount()
        reduced.rerender({ dropKey: null, drop: null })
        reduced.rerender({ dropKey: '1:100', drop: { row: 5, remote: true } })
        expect(play).toHaveBeenCalledTimes(1)

        reducedMotion = false
        play.mockClear()
        const gone = mount()
        gone.rerender({ dropKey: null, drop: null })
        gone.rerender({ dropKey: '1:100', drop: { row: 5, remote: true } })
        gone.unmount()
        tick(2000)
        expect(play).not.toHaveBeenCalled()
    })
})
