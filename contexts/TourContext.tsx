'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { TOUR_STEPS, type TourStep } from '@/lib/tour/tour-steps'

interface TourContextType {
  isActive: boolean
  currentStep: TourStep | null
  currentStepIndex: number
  totalSteps: number
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  completeTour: () => void
}

const TourContext = createContext<TourContextType | undefined>(undefined)

export function TourProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'

  const steps = useMemo(
    () => TOUR_STEPS.filter((s) => !s.authOnly || isAuthenticated),
    [isAuthenticated]
  )

  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const startTour = useCallback(() => {
    setCurrentStepIndex(0)
    setIsActive(true)
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStepIndex((i) => {
      if (i >= steps.length - 1) {
        setIsActive(false)
        return 0
      }
      return i + 1
    })
  }, [steps.length])

  const prevStep = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const skipTour = useCallback(() => {
    setIsActive(false)
    setCurrentStepIndex(0)
  }, [])

  const completeTour = useCallback(() => {
    setIsActive(false)
    setCurrentStepIndex(0)
  }, [])

  const currentStep = isActive ? (steps[currentStepIndex] ?? null) : null

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        currentStepIndex,
        totalSteps: steps.length,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        completeTour,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function useTour(): TourContextType {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside TourProvider')
  return ctx
}
