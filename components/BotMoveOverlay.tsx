'use client'

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YahtzeeCategory } from '@/lib/yahtzee'

interface BotMoveStep {
  type: 'roll' | 'hold' | 'score' | 'thinking'
  data?: {
    dice?: number[]
    held?: number[] // Indices of held dice
    category?: YahtzeeCategory
    score?: number
    rollNumber?: number
  }
  message: string
}

interface BotMoveOverlayProps {
  steps: BotMoveStep[]
  currentStepIndex: number
  botName: string
  onComplete?: () => void
}

const CATEGORY_DISPLAY_NAMES: Record<YahtzeeCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfKind: 'Three of a Kind',
  fourOfKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'Yahtzee',
  chance: 'Chance',
}

export default function BotMoveOverlay({
  steps,
  currentStepIndex,
  botName,
  onComplete,
}: BotMoveOverlayProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(true)

  const currentStep = steps[currentStepIndex]

  useEffect(() => {
    // Auto-complete when all steps are shown
    if (currentStepIndex >= steps.length - 1 && onComplete) {
      const timer = setTimeout(() => {
        setVisible(false)
        onComplete()
      }, 1500) // Wait 1.5s on last step before closing
      return () => clearTimeout(timer)
    }
  }, [currentStepIndex, steps.length, onComplete])

  if (!visible || !currentStep) return null

  const renderStepContent = () => {
    switch (currentStep.type) {
      case 'thinking':
        return (
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <p className="text-gray-700 dark:text-gray-300 text-sm sm:text-base">{currentStep.message}</p>
          </div>
        )

      case 'roll':
        return (
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="animate-spin text-2xl sm:text-3xl">🎲</span>
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-base sm:text-xl">
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && (
              <div className="flex justify-center gap-2 sm:gap-3">
                {currentStep.data.dice.map((die, index) => (
                  <div
                    key={index}
                    className="bg-white dark:bg-gray-700 rounded-lg shadow-lg flex items-center justify-center font-bold text-gray-800 dark:text-white border-2 border-gray-300 dark:border-gray-600 animate-bounce-in w-12 h-12 sm:w-14 sm:h-14 text-lg sm:text-2xl"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {die}
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 'hold':
        return (
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-3xl">🤔</span>
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-base sm:text-xl">
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && currentStep.data?.held && (
              <div className="flex justify-center gap-2 sm:gap-3">
                {currentStep.data.dice.map((die, index) => {
                  const isHeld = currentStep.data?.held?.includes(index) ?? false
                  return (
                    <div
                      key={index}
                      className={`rounded-lg shadow-lg flex items-center justify-center font-bold transition-all border-2 w-12 h-12 sm:w-14 sm:h-14 text-lg sm:text-2xl ${
                        isHeld
                          ? 'bg-yellow-400 dark:bg-yellow-500 border-yellow-600 dark:border-yellow-700 scale-110 ring-2 ring-yellow-500'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-50'
                      }`}
                    >
                      {die}
                    </div>
                  )
                })}
              </div>
            )}
            {currentStep.data?.held && currentStep.data.held.length > 0 && (
              <p className="text-center text-gray-600 dark:text-gray-400 text-xs sm:text-sm">
                Holding {currentStep.data.held.length} {currentStep.data.held.length === 1 ? 'die' : 'dice'}
              </p>
            )}
          </div>
        )

      case 'score':
        return (
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-3xl">📊</span>
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-base sm:text-xl">
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.category && currentStep.data?.score !== undefined && (
              <div className="bg-green-100 dark:bg-green-900 rounded-lg border-2 border-green-500 animate-pulse p-3 sm:p-5">
                <p className="font-bold text-green-800 dark:text-green-200 text-center text-lg sm:text-2xl">
                  {CATEGORY_DISPLAY_NAMES[currentStep.data.category]}
                </p>
                <p className="font-bold text-green-600 dark:text-green-400 text-center text-2xl sm:text-4xl mt-2">
                  +{currentStep.data.score} points
                </p>
              </div>
            )}
          </div>
        )

      default:
        return <p className="text-lg text-gray-700 dark:text-gray-300">{currentStep.message}</p>
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl mx-4 animate-scale-in border-4 border-blue-500 dark:border-blue-600 p-6 sm:p-8 lg:p-10 max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <span className="text-4xl sm:text-5xl">🤖</span>
          <h2 className="font-bold text-gray-900 dark:text-white text-xl sm:text-2xl lg:text-3xl">
            {botName}
          </h2>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: `clamp(20px, 2vh, 32px)` }}>
          <div
            className="w-full bg-gray-200 dark:bg-gray-700 rounded-full"
            style={{ height: `clamp(6px, 0.6vh, 10px)` }}
          >
            <div
              className="bg-blue-500 dark:bg-blue-600 rounded-full transition-all duration-500"
              style={{
                width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
                height: `clamp(6px, 0.6vh, 10px)`,
              }}
            />
          </div>
          <p
            className="text-center text-gray-500 dark:text-gray-400"
            style={{
              fontSize: `clamp(10px, 0.9vw, 12px)`,
              marginTop: `clamp(6px, 0.6vh, 10px)`,
            }}
          >
            Step {currentStepIndex + 1} of {steps.length}
          </p>
        </div>

        {/* Step Content */}
        <div
          style={{
            minHeight: `clamp(150px, 20vh, 250px)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {renderStepContent()}
        </div>
      </div>
    </div>
  )
}
