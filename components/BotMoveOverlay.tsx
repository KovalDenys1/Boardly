'use client'

import React, { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
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
  onePair: 'One Pair',
  twoPairs: 'Two Pairs',
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
          <div className="flex items-center" style={{ gap: `clamp(10px, 1vw, 16px)` }}>
            <div className="flex" style={{ gap: `clamp(3px, 0.3vw, 5px)` }}>
              <div className="bg-blue-400 rounded-full animate-bounce" style={{ width: `clamp(6px, 0.6vw, 10px)`, height: `clamp(6px, 0.6vw, 10px)`, animationDelay: '0ms' }}></div>
              <div className="bg-blue-400 rounded-full animate-bounce" style={{ width: `clamp(6px, 0.6vw, 10px)`, height: `clamp(6px, 0.6vw, 10px)`, animationDelay: '150ms' }}></div>
              <div className="bg-blue-400 rounded-full animate-bounce" style={{ width: `clamp(6px, 0.6vw, 10px)`, height: `clamp(6px, 0.6vw, 10px)`, animationDelay: '300ms' }}></div>
            </div>
            <p className="text-gray-700 dark:text-gray-300" style={{ fontSize: `clamp(14px, 1.4vw, 20px)` }}>{currentStep.message}</p>
          </div>
        )

      case 'roll':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(10px, 1vh, 16px)` }}>
            <div className="flex items-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
              <span className="animate-spin" style={{ fontSize: `clamp(24px, 2.5vw, 36px)` }}>🎲</span>
              <p className="font-semibold text-gray-800 dark:text-gray-200" style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}>
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && (
              <div className="flex justify-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
                {currentStep.data.dice.map((die, index) => (
                  <div
                    key={index}
                    className="bg-white dark:bg-gray-700 rounded-lg shadow-lg flex items-center justify-center font-bold text-gray-800 dark:text-white border-gray-300 dark:border-gray-600 animate-bounce-in"
                    style={{
                      width: `clamp(40px, 4vw, 60px)`,
                      height: `clamp(40px, 4vw, 60px)`,
                      fontSize: `clamp(18px, 1.8vw, 28px)`,
                      borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
                      animationDelay: `${index * 50}ms`
                    }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(10px, 1vh, 16px)` }}>
            <div className="flex items-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
              <span style={{ fontSize: `clamp(24px, 2.5vw, 36px)` }}>🤔</span>
              <p className="font-semibold text-gray-800 dark:text-gray-200" style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}>
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && currentStep.data?.held && (
              <div className="flex justify-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
                {currentStep.data.dice.map((die, index) => {
                  const isHeld = currentStep.data?.held?.includes(index) ?? false
                  return (
                    <div
                      key={index}
                      className={`rounded-lg shadow-lg flex items-center justify-center font-bold transition-all ${
                        isHeld
                          ? 'bg-yellow-400 dark:bg-yellow-500 border-yellow-600 dark:border-yellow-700 scale-110 ring-2 ring-yellow-500'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-50'
                      }`}
                      style={{
                        width: `clamp(40px, 4vw, 60px)`,
                        height: `clamp(40px, 4vw, 60px)`,
                        fontSize: `clamp(18px, 1.8vw, 28px)`,
                        borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
                      }}
                    >
                      {die}
                    </div>
                  )
                })}
              </div>
            )}
            {currentStep.data?.held && currentStep.data.held.length > 0 && (
              <p className="text-center text-gray-600 dark:text-gray-400" style={{ fontSize: `clamp(11px, 1vw, 14px)` }}>
                Holding {currentStep.data.held.length} {currentStep.data.held.length === 1 ? 'die' : 'dice'}
              </p>
            )}
          </div>
        )

      case 'score':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(10px, 1vh, 16px)` }}>
            <div className="flex items-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
              <span style={{ fontSize: `clamp(24px, 2.5vw, 36px)` }}>📊</span>
              <p className="font-semibold text-gray-800 dark:text-gray-200" style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}>
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.category && currentStep.data?.score !== undefined && (
              <div
                className="bg-green-100 dark:bg-green-900 rounded-lg animate-pulse"
                style={{
                  padding: `clamp(12px, 1.2vh, 20px)`,
                  borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
                  borderColor: 'rgb(34 197 94)', // green-500
                }}
              >
                <p
                  className="font-bold text-green-800 dark:text-green-200 text-center"
                  style={{ fontSize: `clamp(18px, 1.8vw, 28px)` }}
                >
                  {CATEGORY_DISPLAY_NAMES[currentStep.data.category]}
                </p>
                <p
                  className="font-bold text-green-600 dark:text-green-400 text-center"
                  style={{
                    fontSize: `clamp(22px, 2.2vw, 36px)`,
                    marginTop: `clamp(6px, 0.6vh, 10px)`,
                  }}
                >
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
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl mx-4 animate-scale-in border-blue-500 dark:border-blue-600"
        style={{
          padding: `clamp(24px, 2.4vh, 40px)`,
          maxWidth: 'min(560px, 90vw)',
          width: '100%',
          borderWidth: `clamp(3px, 0.3vw, 5px)`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-center"
          style={{
            gap: `clamp(10px, 1vw, 16px)`,
            marginBottom: `clamp(20px, 2vh, 32px)`,
          }}
        >
          <span style={{ fontSize: `clamp(32px, 3.5vw, 48px)` }}>🤖</span>
          <h2
            className="font-bold text-gray-900 dark:text-white"
            style={{ fontSize: `clamp(20px, 2vw, 32px)` }}
          >
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
