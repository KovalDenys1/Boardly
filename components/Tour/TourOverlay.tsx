'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTour } from '@/contexts/TourContext'
import { useTranslation } from '@/lib/i18n-helpers'

const SPOTLIGHT_PADDING = 10
const TOOLTIP_WIDTH = 320

export function TourOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, nextStep, prevStep, skipTour } =
    useTour()
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isActive || !currentStep) {
      setTargetRect(null)
      return
    }

    if (currentStep.route !== pathname) {
      setTargetRect(null)
      router.push(currentStep.route)
      return
    }

    if (!currentStep.selector) {
      setTargetRect(null)
      return
    }

    let attempts = 0
    const MAX_ATTEMPTS = 50

    const findElement = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour-step="${currentStep.selector}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          const rect = el.getBoundingClientRect()
          setTargetRect(rect)
        }, 350)
        return
      }
      if (attempts < MAX_ATTEMPTS) {
        attempts++
        rafRef.current = requestAnimationFrame(findElement)
      }
    }

    rafRef.current = requestAnimationFrame(findElement)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [isActive, currentStep, pathname, router])

  useEffect(() => {
    if (!isActive || !currentStep?.selector) return

    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour-step="${currentStep.selector}"]`)
      if (el) setTargetRect(el.getBoundingClientRect())
    }

    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [isActive, currentStep])

  if (!isActive || !currentStep) return null

  const isFirst = currentStepIndex === 0
  const isLast = currentStepIndex === totalSteps - 1
  const isCentered = !currentStep.selector || !targetRect

  const titleKey = `tour.steps.${currentStep.id}.title` as Parameters<typeof t>[0]
  const descKey = `tour.steps.${currentStep.id}.description` as Parameters<typeof t>[0]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] pointer-events-none"
        style={{ background: 'rgba(0,0,0,0)' }}
      />

      {/* Spotlight */}
      {targetRect && (
        <div
          className="fixed z-[201] rounded-2xl pointer-events-none transition-all duration-300"
          style={{
            top: targetRect.top - SPOTLIGHT_PADDING,
            left: targetRect.left - SPOTLIGHT_PADDING,
            width: targetRect.width + SPOTLIGHT_PADDING * 2,
            height: targetRect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
            outline: '2px solid rgba(99,102,241,0.6)',
          }}
        />
      )}

      {/* Dark overlay for centered steps */}
      {isCentered && (
        <div className="fixed inset-0 z-[201] bg-black/70 pointer-events-none" />
      )}

      {/* Tooltip */}
      <TourTooltip
        title={t(titleKey)}
        description={t(descKey)}
        targetRect={targetRect}
        placement={currentStep.placement}
        isCentered={isCentered}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        isFirst={isFirst}
        isLast={isLast}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={skipTour}
        nextLabel={isLast ? t('tour.navigation.finish') : t('tour.navigation.next')}
        prevLabel={t('tour.navigation.prev')}
        skipLabel={t('tour.navigation.skip')}
        stepLabel={t('tour.navigation.stepOf', {
          current: String(currentStepIndex + 1),
          total: String(totalSteps),
        })}
      />
    </>
  )
}

interface TooltipProps {
  title: string
  description: string
  targetRect: DOMRect | null
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  isCentered: boolean
  currentStepIndex: number
  totalSteps: number
  isFirst: boolean
  isLast: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  nextLabel: string
  prevLabel: string
  skipLabel: string
  stepLabel: string
}

function TourTooltip({
  title,
  description,
  targetRect,
  placement,
  isCentered,
  isFirst,
  isLast,
  onNext,
  onPrev,
  onSkip,
  nextLabel,
  prevLabel,
  skipLabel,
  stepLabel,
}: TooltipProps) {
  const GAP = 16
  const SPOTLIGHT_PAD = SPOTLIGHT_PADDING

  const getStyle = (): React.CSSProperties => {
    if (isCentered || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: TOOLTIP_WIDTH,
        zIndex: 202,
      }
    }

    const style: React.CSSProperties = { position: 'fixed', width: TOOLTIP_WIDTH, zIndex: 202 }

    switch (placement) {
      case 'bottom':
        style.top = targetRect.bottom + SPOTLIGHT_PAD + GAP
        style.left = Math.max(8, Math.min(
          window.innerWidth - TOOLTIP_WIDTH - 8,
          targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2
        ))
        break
      case 'top':
        style.left = Math.max(8, Math.min(
          window.innerWidth - TOOLTIP_WIDTH - 8,
          targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2
        ))
        // set bottom so it stays above the element; use top calculated from viewport
        style.top = targetRect.top - SPOTLIGHT_PAD - GAP - 180 // approximate height
        break
      case 'left':
        style.top = Math.max(8, Math.min(
          window.innerHeight - 200,
          targetRect.top + targetRect.height / 2 - 90
        ))
        style.left = Math.max(8, targetRect.left - SPOTLIGHT_PAD - GAP - TOOLTIP_WIDTH)
        break
      case 'right':
        style.top = Math.max(8, Math.min(
          window.innerHeight - 200,
          targetRect.top + targetRect.height / 2 - 90
        ))
        style.left = Math.min(
          window.innerWidth - TOOLTIP_WIDTH - 8,
          targetRect.right + SPOTLIGHT_PAD + GAP
        )
        break
    }

    return style
  }

  return (
    <div
      style={getStyle()}
      className="rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden"
    >
      <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">
          {stepLabel}
        </p>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
          {description}
        </p>

        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onPrev}
              className="px-3 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {prevLabel}
            </button>
          )}
          <button
            onClick={onNext}
            className="flex-1 px-4 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {nextLabel}
          </button>
        </div>

        {!isLast && (
          <button
            onClick={onSkip}
            className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {skipLabel}
          </button>
        )}
      </div>
    </div>
  )
}
