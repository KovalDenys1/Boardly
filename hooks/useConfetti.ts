import { useCallback } from 'react'

type ConfettiFn = (options?: Record<string, unknown>) => unknown

let confettiLoader: Promise<ConfettiFn> | null = null

function loadConfetti(): Promise<ConfettiFn> {
  if (!confettiLoader) {
    confettiLoader = import('canvas-confetti').then((mod) => {
      const maybeDefault = (mod as { default?: unknown }).default
      const confetti = (maybeDefault ?? mod) as unknown

      if (typeof confetti !== 'function') {
        throw new Error('canvas-confetti module did not return a callable export')
      }

      return confetti as ConfettiFn
    })
  }

  return confettiLoader
}

export function useConfetti() {
  const celebrate = useCallback(() => {
    void (async () => {
      const confetti = await loadConfetti()
      const count = 200
      const defaults = {
        origin: { y: 0.7 },
        zIndex: 9999,
      }

      function fire(particleRatio: number, opts: Record<string, unknown>) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        })
      }

      fire(0.25, {
        spread: 26,
        startVelocity: 55,
      })

      fire(0.2, {
        spread: 60,
      })

      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      })

      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      })

      fire(0.1, {
        spread: 120,
        startVelocity: 45,
      })
    })()
  }, [])

  const fireworks = useCallback(() => {
    void (async () => {
      const confetti = await loadConfetti()
      const duration = 3 * 1000
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 }

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min
      }

      const interval = setInterval(function () {
        const timeLeft = animationEnd - Date.now()

        if (timeLeft <= 0) {
          clearInterval(interval)
          return
        }

        const particleCount = 50 * (timeLeft / duration)
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        })
      }, 250)
    })()
  }, [])

  return { celebrate, fireworks }
}
