'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTour } from '@/contexts/TourContext'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getPublicRegisteredGameTypes } from '@/lib/public-game-access'
import { getGameMetadata, hasBotSupport } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'
import type { TourStepPlacement } from '@/lib/tour/tour-steps'

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const SPOTLIGHT_PADDING = 8
const TOOLTIP_GAP = 16
const TOOLTIP_WIDTH = 340
const ESTIMATED_TOOLTIP_HEIGHT = 200
const VIEWPORT_MARGIN = 16
const MAX_MEASURE_ATTEMPTS = 40

function computeTooltipStyle(
  rect: TargetRect | null,
  placement: TourStepPlacement,
  viewportW: number,
  viewportH: number
): CSSProperties {
  const width = Math.min(TOOLTIP_WIDTH, viewportW - VIEWPORT_MARGIN * 2)

  if (!rect) {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width,
    }
  }

  let top: number
  let left: number
  let translateX = '-50%'
  let translateY = '0'

  switch (placement) {
    case 'top':
      top = rect.top - TOOLTIP_GAP
      left = rect.left + rect.width / 2
      translateY = '-100%'
      break
    case 'left':
      top = rect.top + rect.height / 2
      left = rect.left - TOOLTIP_GAP
      translateX = '-100%'
      translateY = '-50%'
      break
    case 'right':
      top = rect.top + rect.height / 2
      left = rect.left + rect.width + TOOLTIP_GAP
      translateX = '0'
      translateY = '-50%'
      break
    case 'bottom':
    default:
      top = rect.top + rect.height + TOOLTIP_GAP
      left = rect.left + rect.width / 2
      break
  }

  // Flip vertically if there's no room, so the tooltip never overflows off-screen.
  if (placement === 'bottom' && top + ESTIMATED_TOOLTIP_HEIGHT > viewportH - VIEWPORT_MARGIN) {
    top = rect.top - TOOLTIP_GAP
    translateY = '-100%'
  } else if (placement === 'top' && top - ESTIMATED_TOOLTIP_HEIGHT < VIEWPORT_MARGIN) {
    top = rect.top + rect.height + TOOLTIP_GAP
    translateY = '0'
  }

  // Clamp horizontally so the tooltip always stays within the viewport (mobile-safe).
  const halfWidth = width / 2
  if (translateX === '-50%') {
    left = Math.min(Math.max(left, halfWidth + VIEWPORT_MARGIN), viewportW - halfWidth - VIEWPORT_MARGIN)
  }
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), viewportH - VIEWPORT_MARGIN)

  return {
    position: 'fixed',
    top,
    left,
    width,
    transform: `translate(${translateX}, ${translateY})`,
  }
}

function TourCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="animate-scale-in rounded-[20px]"
      style={{
        background: 'var(--bd-card-warm)',
        border: '2px solid var(--bd-ink)',
        boxShadow: '6px 6px 0 var(--bd-ink)',
        padding: '20px',
      }}
    >
      {children}
    </div>
  )
}

function TourNav({
  stepLabel,
  showBack,
  onBack,
  onNext,
  onSkip,
  nextLabel,
  backLabel,
  skipLabel,
}: {
  stepLabel: string
  showBack: boolean
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  nextLabel: string
  backLabel: string
  skipLabel: string
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--bd-ink-muted)' }}>
          {stepLabel}
        </span>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs font-semibold underline"
          style={{ color: 'var(--bd-ink-muted)' }}
        >
          {skipLabel}
        </button>
      </div>
      <div className="flex items-center justify-end gap-2">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border-2 px-3 py-1.5 text-sm font-semibold"
            style={{ borderColor: 'var(--bd-ink)', color: 'var(--bd-ink)', background: 'var(--bd-bg)' }}
          >
            {backLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl border-2 px-4 py-1.5 text-sm font-bold text-white"
          style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-coral)', boxShadow: '2px 2px 0 var(--bd-ink)' }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

export function TourOverlay() {
  const { isActive, currentStep, currentStepIndex, steps, nextStep, prevStep, endTour, skipTour } = useTour()
  const { completeOnboarding } = useOnboarding()
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [quickStartGame, setQuickStartGame] = useState<string | null>(null)
  const [quickStartLoading, setQuickStartLoading] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const onRightRoute = !currentStep?.route || pathname === currentStep.route

  const games = useMemo(
    () => getPublicRegisteredGameTypes().map((type) => ({ type, meta: getGameMetadata(type)! })).filter(({ type }) => hasBotSupport(type)),
    []
  )

  useEffect(() => {
    if (!isActive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isActive])

  const getFocusableElements = useCallback((): HTMLElement[] => {
    const card = cardRef.current
    if (!card) return []
    return Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement
    )
  }, [])

  // Escape to dismiss, and keep Tab inside the tour card while it's open —
  // mirrors Modal.tsx's trap, since this overlay is modal-like (full-viewport
  // interaction blocker) but previously had no keyboard escape hatch at all.
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        endTour()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = getFocusableElements()
      if (focusable.length === 0) {
        e.preventDefault()
        cardRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey && (active === first || active === cardRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActive, endTour, getFocusableElements])

  // Move focus into the card on open and on each step change (content and
  // focusable controls differ per step), and hand focus back on close.
  useEffect(() => {
    if (!isActive) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusable = getFocusableElements()
    ;(focusable[0] ?? cardRef.current)?.focus()

    return () => {
      previouslyFocused?.focus?.()
    }
  }, [isActive, currentStepIndex, getFocusableElements])

  useEffect(() => {
    if (!isActive || !currentStep?.selector || !onRightRoute) {
      setTargetRect(null)
      return
    }

    let attempts = 0
    let rafId = 0
    let cancelled = false

    const measure = () => {
      if (cancelled) return
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      const el = document.querySelector(currentStep.selector!)
      if (!el) {
        attempts += 1
        if (attempts < MAX_MEASURE_ATTEMPTS) {
          rafId = requestAnimationFrame(measure)
        } else {
          setTargetRect(null)
        }
        return
      }
      const rect = el.getBoundingClientRect()
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
    measure()

    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [isActive, currentStep, onRightRoute])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setViewport({ width: window.innerWidth, height: window.innerHeight })
  }, [currentStepIndex])

  const handleQuickStart = useCallback(async () => {
    if (!quickStartGame || quickStartLoading) return
    setQuickStartLoading(true)
    try {
      const lobbyRes = await fetchWithGuest('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: quickStartGame, maxPlayers: 2 }),
      })
      if (!lobbyRes.ok) throw new Error('Failed to create lobby')
      const { lobby } = (await lobbyRes.json()) as { lobby: { code: string } }

      const botRes = await fetchWithGuest(`/api/lobby/${lobby.code}/add-bot`, { method: 'POST' })
      if (!botRes.ok) throw new Error('Failed to add bot')

      await completeOnboarding()
      endTour()
      router.push(`/lobby/${lobby.code}`)
    } catch {
      showToast.error('common.error')
      setQuickStartLoading(false)
    }
  }, [quickStartGame, quickStartLoading, completeOnboarding, endTour, router])

  if (!isActive || !currentStep) return null

  const isQuickStartStep = currentStep.id === 'quick-start'
  const showSpotlight = onRightRoute && !!targetRect
  const stepLabel = t('tour.stepOf', { current: currentStepIndex + 1, total: steps.length })
  const nextLabel = t('tour.next')
  const backLabel = t('tour.back')

  const tooltipStyle = computeTooltipStyle(
    showSpotlight ? targetRect : null,
    currentStep.placement,
    viewport.width || (typeof window !== 'undefined' ? window.innerWidth : 1280),
    viewport.height || (typeof window !== 'undefined' ? window.innerHeight : 800)
  )

  return (
    <>
      {!showSpotlight && (
        <div className="fixed inset-0 z-[105] animate-fade-in" style={{ background: 'rgba(31,27,22,0.7)' }} />
      )}
      {showSpotlight && targetRect && (
        <div
          className="pointer-events-none fixed z-[105] rounded-2xl transition-all duration-200"
          style={{
            top: targetRect.top - SPOTLIGHT_PADDING,
            left: targetRect.left - SPOTLIGHT_PADDING,
            width: targetRect.width + SPOTLIGHT_PADDING * 2,
            height: targetRect.height + SPOTLIGHT_PADDING * 2,
            // focus-rings-allow: the spotlight dims the whole page with a 9999px spread.
            boxShadow: '0 0 0 9999px rgba(31,27,22,0.7)',
          }}
        />
      )}
      {/* Full-viewport interaction blocker — only the tooltip card itself is clickable. */}
      <div className="fixed inset-0 z-[106]" />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed z-[110]"
        style={tooltipStyle}
      >
        <TourCard>
          {isQuickStartStep ? (
            <>
              <h2
                id={titleId}
                className="mb-1 text-lg font-bold"
                style={{ fontFamily: 'var(--bd-font-display)', color: 'var(--bd-ink)' }}
              >
                {t(currentStep.titleKey)}
              </h2>
              <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
                {t(currentStep.descriptionKey)}
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                {games.map(({ type, meta }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setQuickStartGame(type)}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center"
                    style={{
                      background: quickStartGame === type ? 'var(--bd-sun)' : 'var(--bd-bg)',
                      borderColor: 'var(--bd-ink)',
                      boxShadow: '3px 3px 0 var(--bd-ink)',
                    }}
                  >
                    <GameIcon gameId={meta.svgId} accentColor="var(--bd-ink)" size={26} />
                    <span className="text-xs font-bold" style={{ color: 'var(--bd-ink)' }}>
                      {meta.name}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleQuickStart}
                disabled={!quickStartGame || quickStartLoading}
                className="mb-2 w-full rounded-xl border-2 py-3 text-sm font-bold text-white"
                style={{
                  borderColor: 'var(--bd-ink)',
                  background: 'var(--bd-coral)',
                  boxShadow: '3px 3px 0 var(--bd-ink)',
                  opacity: !quickStartGame || quickStartLoading ? 0.5 : 1,
                }}
              >
                {quickStartLoading ? t('onboarding.starting') : t('onboarding.startPlaying')}
              </button>
              <button type="button" onClick={skipTour} className="w-full text-center text-xs font-semibold" style={{ color: 'var(--bd-ink-muted)' }}>
                {t('tour.skipTour')}
              </button>
            </>
          ) : (
            <>
              <h2
                id={titleId}
                className="mb-1 text-lg font-bold"
                style={{ fontFamily: 'var(--bd-font-display)', color: 'var(--bd-ink)' }}
              >
                {t(currentStep.titleKey)}
              </h2>
              <p className="text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
                {t(currentStep.descriptionKey)}
              </p>
              <TourNav
                stepLabel={stepLabel}
                showBack={currentStepIndex > 0}
                onBack={prevStep}
                onNext={nextStep}
                onSkip={skipTour}
                nextLabel={nextLabel}
                backLabel={backLabel}
                skipLabel={t('tour.skipTour')}
              />
            </>
          )}
        </TourCard>
      </div>
    </>
  )
}
