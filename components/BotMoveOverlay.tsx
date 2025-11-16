'use client'

import React, { useEffect, useState } from 'react'
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
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <p className="text-lg text-gray-700 dark:text-gray-300">{currentStep.message}</p>
          </div>
        )

      case 'roll':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl animate-spin">🎲</span>
              <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && (
              <div className="flex gap-2 justify-center">
                {currentStep.data.dice.map((die, index) => (
                  <div
                    key={index}
                    className="w-12 h-12 bg-white dark:bg-gray-700 rounded-lg shadow-lg flex items-center justify-center text-2xl font-bold text-gray-800 dark:text-white border-2 border-gray-300 dark:border-gray-600 animate-bounce-in"
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
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🤔</span>
              <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && currentStep.data?.held && (
              <div className="flex gap-2 justify-center">
                {currentStep.data.dice.map((die, index) => {
                  const isHeld = currentStep.data?.held?.includes(index) ?? false
                  return (
                    <div
                      key={index}
                      className={`
                        w-12 h-12 rounded-lg shadow-lg flex items-center justify-center text-2xl font-bold
                        border-2 transition-all
                        ${
                          isHeld
                            ? 'bg-yellow-400 dark:bg-yellow-500 border-yellow-600 dark:border-yellow-700 scale-110 ring-2 ring-yellow-500'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-50'
                        }
                      `}
                    >
                      {die}
                    </div>
                  )
                })}
              </div>
            )}
            {currentStep.data?.held && currentStep.data.held.length > 0 && (
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                Holding {currentStep.data.held.length} {currentStep.data.held.length === 1 ? 'die' : 'dice'}
              </p>
            )}
          </div>
        )

      case 'score':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">📊</span>
              <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.category && currentStep.data?.score !== undefined && (
              <div className="bg-green-100 dark:bg-green-900 rounded-lg p-4 border-2 border-green-500 animate-pulse">
                <p className="text-2xl font-bold text-green-800 dark:text-green-200 text-center">
                  {CATEGORY_DISPLAY_NAMES[currentStep.data.category]}
                </p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400 text-center mt-2">
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-scale-in border-4 border-blue-500 dark:border-blue-600">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-4xl">🤖</span>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{botName}</h2>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 dark:bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
            Step {currentStepIndex + 1} of {steps.length}
          </p>
        </div>

        {/* Step Content */}
        <div className="min-h-[200px] flex items-center justify-center">{renderStepContent()}</div>
      </div>
    </div>
  )
}
