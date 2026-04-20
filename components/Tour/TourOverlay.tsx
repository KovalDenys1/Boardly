'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTour } from '@/contexts/TourContext'
import { useTranslation } from '@/lib/i18n-helpers'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { getPublicRegisteredGameTypes } from '@/lib/public-game-access'
import { getGameMetadata, hasBotSupport } from '@/lib/game-catalog'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8

function useTargetRect(selector: string | null, isActive: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!isActive || !selector) {
      setRect(null)
      return
    }

    const measure = () => {
      const el = document.querySelector(selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    measure()
    const timer = setInterval(measure, 300)
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure, { passive: true })

    return () => {
      clearInterval(timer)
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [selector, isActive])

  return rect
}

function getTooltipStyle(
  placement: string,
  rect: Rect | null,
  tooltipWidth: number,
  tooltipHeight: number
): React.CSSProperties {
  if (!rect || placement === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: Math.min(tooltipWidth, window.innerWidth - 32),
      zIndex: 10001,
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = PADDING + 8

  let top: number
  let left: number

  if (placement === 'bottom') {
    top = rect.top + rect.height + pad
    left = rect.left + rect.width / 2 - tooltipWidth / 2
  } else if (placement === 'top') {
    top = rect.top - tooltipHeight - pad
    left = rect.left + rect.width / 2 - tooltipWidth / 2
  } else if (placement === 'left') {
    top = rect.top + rect.height / 2 - tooltipHeight / 2
    left = rect.left - tooltipWidth - pad
  } else {
    top = rect.top + rect.height / 2 - tooltipHeight / 2
    left = rect.left + rect.width + pad
  }

  // Clamp to viewport
  left = Math.max(8, Math.min(left, vw - tooltipWidth - 8))
  top = Math.max(8, Math.min(top, vh - tooltipHeight - 8))

  return { position: 'fixed', top, left, width: tooltipWidth, zIndex: 10001 }
}

export function TourOverlay() {
  const router = useRouter()
  const { t } = useTranslation()
  const { isActive, currentStep, step, totalSteps, nextStep, prevStep, skipTour } = useTour()
  const { completeOnboarding } = useOnboarding()
  const rect = useTargetRect(step?.selector ?? null, isActive)
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)

  const botGames = useMemo(
    () =>
      getPublicRegisteredGameTypes()
        .filter(hasBotSupport)
        .map((type) => ({ type, meta: getGameMetadata(type)! })),
    []
  )

  const isLastStep = step?.id === 'quick-start'
  const isFirstStep = currentStep === 0

  const handleLaunch = useCallback(async () => {
    if (!selectedGame || launching) return
    setLaunching(true)
    try {
      const lobbyRes = await fetchWithGuest('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: selectedGame, maxPlayers: 2 }),
      })
      if (!lobbyRes.ok) throw new Error('Failed to create lobby')
      const { lobby } = (await lobbyRes.json()) as { lobby: { code: string } }

      const botRes = await fetchWithGuest(`/api/lobby/${lobby.code}/add-bot`, { method: 'POST' })
      if (!botRes.ok) throw new Error('Failed to add bot')

      await completeOnboarding()
      skipTour()
      router.push(`/lobby/${lobby.code}`)
    } catch {
      showToast.error('common.error')
      setLaunching(false)
    }
  }, [selectedGame, launching, completeOnboarding, skipTour, router])

  if (!isActive || !step) return null

  const hasSpotlight = !!rect && step.placement !== 'center'
  const tooltipWidth = 320

  const spotlightStyle: React.CSSProperties = hasSpotlight
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.65), 0 0 0 ${PADDING}px rgba(255,255,255,0.12) inset`,
        clipPath: `polygon(
          0% 0%, 100% 0%, 100% 100%, 0% 100%,
          0% ${rect.top - PADDING}px,
          ${rect.left - PADDING}px ${rect.top - PADDING}px,
          ${rect.left - PADDING}px ${rect.top + rect.height + PADDING}px,
          ${rect.left + rect.width + PADDING}px ${rect.top + rect.height + PADDING}px,
          ${rect.left + rect.width + PADDING}px ${rect.top - PADDING}px,
          0% ${rect.top - PADDING}px
        )`,
        pointerEvents: 'none',
      }
    : {
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.65)',
        pointerEvents: 'none',
      }

  // Highlight border around the target
  const highlightStyle: React.CSSProperties | null =
    hasSpotlight && rect
      ? {
          position: 'fixed',
          top: rect.top - PADDING,
          left: rect.left - PADDING,
          width: rect.width + PADDING * 2,
          height: rect.height + PADDING * 2,
          border: '2px solid rgba(99,102,241,0.8)',
          borderRadius: 12,
          zIndex: 10000,
          pointerEvents: 'none',
          boxShadow: '0 0 0 4px rgba(99,102,241,0.2)',
          transition: 'all 0.3s ease',
        }
      : null

  const tooltipStyle = getTooltipStyle(step.placement, rect, tooltipWidth, 260)

  return (
    <>
      <div style={spotlightStyle} />
      {highlightStyle && <div style={highlightStyle} />}

      <div
        style={tooltipStyle}
        className="rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="p-5">
          {/* Step counter */}
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
            {t('tour.stepOf', { current: currentStep + 1, total: totalSteps })}
          </p>

          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {t(step.titleKey)}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {t(step.descriptionKey)}
          </p>

          {/* Quick Start game picker on last step */}
          {isLastStep && (
            <div className="grid grid-cols-1 gap-2 mb-4">
              {botGames.map(({ type, meta }) => (
                <button
                  key={type}
                  onClick={() => setSelectedGame(type)}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition-colors text-sm ${
                    selectedGame === type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                  }`}
                >
                  <span className="text-2xl">{meta.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{meta.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={prevStep}
                className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {t('common.previous')}
              </button>
            )}

            {isLastStep ? (
              <button
                onClick={handleLaunch}
                disabled={!selectedGame || launching}
                className="ml-auto px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {launching ? t('onboarding.starting') : t('tour.play')}
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="ml-auto px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold shadow hover:opacity-90 transition-opacity"
              >
                {t('common.next')}
              </button>
            )}
          </div>

          {/* Skip */}
          <button
            onClick={skipTour}
            className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {t('tour.skip')}
          </button>
        </div>
      </div>

      {/* Keyboard navigation */}
      <KeyboardHandler />
    </>
  )
}

function KeyboardHandler() {
  const { nextStep, prevStep, skipTour } = useTour()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep()
      if (e.key === 'ArrowLeft') prevStep()
      if (e.key === 'Escape') skipTour()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nextStep, prevStep, skipTour])
  return null
}
