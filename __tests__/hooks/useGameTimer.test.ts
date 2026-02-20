import { act, renderHook } from '@testing-library/react'
import { useGameTimer } from '@/app/lobby/[code]/hooks/useGameTimer'

describe('useGameTimer race guards', () => {
  const advanceAndFlush = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms)
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-20T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('does not invoke onTimeout again while a previous timeout handler is in flight', async () => {
    let resolveFirst: ((value: boolean) => void) | null = null
    const onTimeout = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve
        })
    )

    renderHook(() =>
      useGameTimer({
        isMyTurn: true,
        gameState: { currentPlayerIndex: 0, status: 'playing' },
        turnTimerLimit: 1,
        onTimeout,
      })
    )

    await advanceAndFlush(1000)
    await advanceAndFlush(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    // Keep the first timeout unresolved longer than debounce window.
    await advanceAndFlush(4000)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst?.(true)
      await Promise.resolve()
    })

    await advanceAndFlush(2000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('retries timeout handler when onTimeout returns false', async () => {
    const onTimeout = jest
      .fn<Promise<boolean>, []>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    renderHook(() =>
      useGameTimer({
        isMyTurn: true,
        gameState: { currentPlayerIndex: 0, status: 'playing' },
        turnTimerLimit: 1,
        onTimeout,
      })
    )

    await advanceAndFlush(1000)
    await advanceAndFlush(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    // Retry is throttled by debounce; advance beyond 1500ms window.
    await advanceAndFlush(2000)
    await advanceAndFlush(1)
    expect(onTimeout).toHaveBeenCalledTimes(2)
  })

  it('ignores stale timeout completion after turn changes', async () => {
    let resolveFirst: ((value: boolean) => void) | null = null
    const onTimeout = jest
      .fn<Promise<boolean>, []>()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce(true)

    const { rerender } = renderHook(
      (props: {
        isMyTurn: boolean
        gameState: { currentPlayerIndex: number; status: string }
        turnTimerLimit: number
        onTimeout: () => boolean | Promise<boolean>
      }) => useGameTimer(props),
      {
        initialProps: {
          isMyTurn: true,
          gameState: { currentPlayerIndex: 0, status: 'playing' },
          turnTimerLimit: 1,
          onTimeout,
        },
      }
    )

    await advanceAndFlush(1000)
    await advanceAndFlush(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    // Turn changed while first timeout resolution is still in flight.
    rerender({
      isMyTurn: true,
      gameState: { currentPlayerIndex: 1, status: 'playing' },
      turnTimerLimit: 1,
      onTimeout,
    })

    await act(async () => {
      resolveFirst?.(true)
      await Promise.resolve()
    })

    await advanceAndFlush(1000)
    await advanceAndFlush(1)
    expect(onTimeout).toHaveBeenCalledTimes(2)
  })
})
