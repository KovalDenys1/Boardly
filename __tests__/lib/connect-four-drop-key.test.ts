import { act, renderHook } from '@testing-library/react'
import { useFreshKey } from '@/hooks/useFreshKey'
import { nextDropKey, type DropKey } from '@/lib/connect-four-drop-key'
import type { ConnectFourMoveRecord } from '@/lib/games/connect-four-game'

const drop = (col: number, row: number, disc: 1 | 2, timestamp: number): ConnectFourMoveRecord => ({ col, row, disc, timestamp })

describe('nextDropKey', () => {
  it('has no key without a move', () => {
    expect(nextDropKey(null, undefined)).toBeNull()
    expect(nextDropKey(null, [])).toBeNull()
  })

  it('keeps the key when the server restamps the same move', () => {
    const optimistic = nextDropKey(null, [drop(3, 5, 1, 100)])
    const server = nextDropKey(optimistic, [drop(3, 5, 1, 640)])
    expect(server?.key).toBe(optimistic?.key)
  })

  it('gives the next move a new key', () => {
    const first = nextDropKey(null, [drop(3, 5, 1, 100)])
    const second = nextDropKey(first, [drop(3, 5, 1, 100), drop(3, 4, 2, 900)])
    expect(second?.key).not.toBe(first?.key)
  })

  it('gives a move replayed into the same cell after an undo a new key', () => {
    const first = nextDropKey(null, [drop(3, 5, 1, 100)])
    const undone = nextDropKey(first, [])
    const again = nextDropKey(undone, [drop(3, 5, 1, 2000)])
    expect(again?.key).not.toBe(first?.key)
  })
})

describe('the first drop of a game that loaded empty', () => {
  it('is fresh once: the server copy of the settled move is not fresh again', () => {
    let previous: DropKey | null = null
    const keyFor = (history: ConnectFourMoveRecord[]) => {
      previous = nextDropKey(previous, history)
      return previous?.key ?? null
    }
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useFreshKey(k), {
      initialProps: { k: keyFor([]) },
    })

    rerender({ k: keyFor([drop(3, 5, 1, 100)]) })
    expect(result.current.fresh).toBe(true)
    act(() => result.current.settle())
    expect(result.current.fresh).toBe(false)

    rerender({ k: keyFor([drop(3, 5, 1, 640)]) })
    expect(result.current.fresh).toBe(false)

    rerender({ k: keyFor([drop(3, 5, 1, 640), drop(4, 5, 2, 1500)]) })
    expect(result.current.fresh).toBe(true)
  })
})

describe('an accepted undo (#1288)', () => {
  it('leaves the disc it uncovers where it is', () => {
    let previous: DropKey | null = null
    const keyFor = (history: ConnectFourMoveRecord[]) => {
      previous = nextDropKey(previous, history)
      return previous?.key ?? null
    }
    const first = drop(3, 5, 1, 640)
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useFreshKey(k), {
      initialProps: { k: keyFor([]) },
    })

    rerender({ k: keyFor([first]) })
    act(() => result.current.settle())
    rerender({ k: keyFor([first, drop(4, 5, 2, 1500)]) })
    expect(result.current.fresh).toBe(true)
    act(() => result.current.settle())

    rerender({ k: keyFor([first]) })
    expect(result.current.fresh).toBe(false)
  })

  it('still drops the first disc of a new round that lands where the last round began', () => {
    const lastRound = nextDropKey(null, [drop(3, 5, 1, 640), drop(4, 5, 2, 1500)])
    const nextRound = nextDropKey(lastRound, [drop(3, 5, 1, 9000)])
    expect(nextRound?.key).not.toBe(lastRound?.key)
  })
})
