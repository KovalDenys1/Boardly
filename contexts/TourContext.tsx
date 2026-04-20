'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TOUR_STEPS, type TourStep } from '@/lib/tour/tour-steps'

interface TourContextType {
  isActive: boolean
  currentStep: number
  step: TourStep | null
  totalSteps: number
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
}

const TourContext = createContext<TourContextType | undefined>(undefined)

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const pendingNavigationStep = useRef<number | null>(null)

  const visibleSteps = TOUR_STEPS.filter((s) => !s.authOnly || isAuthenticated)
  const step = isActive ? (visibleSteps[currentStep] ?? null) : null
  const totalSteps = visibleSteps.length

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
    const first = visibleSteps[0]
    if (first?.route) {
      pendingNavigationStep.current = 0
      router.push(first.route)
    }
  }, [router, visibleSteps])

  const goToStep = useCallback(
    (index: number) => {
      const next = visibleSteps[index]
      if (!next) return
      setCurrentStep(index)
      if (next.route) {
        pendingNavigationStep.current = index
        router.push(next.route)
      }
    },
    [router, visibleSteps]
  )

  const nextStep = useCallback(() => {
    if (currentStep + 1 >= totalSteps) {
      setIsActive(false)
      return
    }
    goToStep(currentStep + 1)
  }, [currentStep, totalSteps, goToStep])

  const prevStep = useCallback(() => {
    if (currentStep <= 0) return
    goToStep(currentStep - 1)
  }, [currentStep, goToStep])

  const skipTour = useCallback(() => {
    setIsActive(false)
  }, [])

  // Scroll target into view after navigation settles
  useEffect(() => {
    if (!isActive || !step?.selector) return
    const timer = setTimeout(() => {
      const el = document.querySelector(step.selector!)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 400)
    return () => clearTimeout(timer)
  }, [isActive, step])

  return (
    <TourContext.Provider value={{ isActive, currentStep, step, totalSteps, startTour, nextStep, prevStep, skipTour }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTour(): TourContextType {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside TourProvider')
  return ctx
}
