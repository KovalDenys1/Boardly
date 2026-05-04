'use client'

import React, { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { YahtzeeCategory } from '@/lib/yahtzee'
import type { BotMoveStep } from '@/types/game'

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
  onePair: 'One Pair',
  twoPairs: 'Two Pairs',
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
    if (currentStepIndex >= steps.length - 1 && onComplete) {
      const timer = setTimeout(() => {
        setVisible(false)
        onComplete()
      }, 1500)
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
              <div
                className="rounded-full animate-bounce"
                style={{
                  width: `clamp(6px, 0.6vw, 10px)`,
                  height: `clamp(6px, 0.6vw, 10px)`,
                  background: 'var(--bd-sun)',
                  animationDelay: '0ms',
                }}
              />
              <div
                className="rounded-full animate-bounce"
                style={{
                  width: `clamp(6px, 0.6vw, 10px)`,
                  height: `clamp(6px, 0.6vw, 10px)`,
                  background: 'var(--bd-sun)',
                  animationDelay: '150ms',
                }}
              />
              <div
                className="rounded-full animate-bounce"
                style={{
                  width: `clamp(6px, 0.6vw, 10px)`,
                  height: `clamp(6px, 0.6vw, 10px)`,
                  background: 'var(--bd-sun)',
                  animationDelay: '300ms',
                }}
              />
            </div>
            <p style={{ fontSize: `clamp(14px, 1.4vw, 20px)`, color: 'var(--bd-ink-soft)' }}>
              {currentStep.message}
            </p>
          </div>
        )

      case 'roll':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(10px, 1vh, 16px)` }}>
            <div className="flex items-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
              <span className="animate-spin" style={{ fontSize: `clamp(24px, 2.5vw, 36px)` }}>🎲</span>
              <p className="font-semibold" style={{ fontSize: `clamp(16px, 1.6vw, 24px)`, color: 'var(--bd-ink)' }}>
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.dice && (
              <div className="flex justify-center" style={{ gap: `clamp(6px, 0.6vw, 10px)` }}>
                {currentStep.data.dice.map((die, index) => (
                  <div
                    key={index}
                    className="rounded-lg shadow-lg flex items-center justify-center font-bold animate-bounce-in"
                    style={{
                      width: `clamp(40px, 4vw, 60px)`,
                      height: `clamp(40px, 4vw, 60px)`,
                      fontSize: `clamp(18px, 1.8vw, 28px)`,
                      background: 'var(--bd-bg)',
                      border: `clamp(1.5px, 0.15vw, 2.5px) solid var(--bd-line)`,
                      color: 'var(--bd-ink)',
                      animationDelay: `${index * 50}ms`,
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
              <p className="font-semibold" style={{ fontSize: `clamp(16px, 1.6vw, 24px)`, color: 'var(--bd-ink)' }}>
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
                      className="rounded-lg shadow-lg flex items-center justify-center font-bold transition-all"
                      style={{
                        width: `clamp(40px, 4vw, 60px)`,
                        height: `clamp(40px, 4vw, 60px)`,
                        fontSize: `clamp(18px, 1.8vw, 28px)`,
                        background: isHeld ? 'var(--bd-sun)' : 'var(--bd-bg)',
                        border: `clamp(1.5px, 0.15vw, 2.5px) solid ${isHeld ? '#E6B040' : 'var(--bd-line)'}`,
                        color: 'var(--bd-ink)',
                        opacity: isHeld ? 1 : 0.5,
                        transform: isHeld ? 'scale(1.1)' : 'scale(1)',
                        outline: isHeld ? '2px solid var(--bd-sun)' : 'none',
                      }}
                    >
                      {die}
                    </div>
                  )
                })}
              </div>
            )}
            {currentStep.data?.held && currentStep.data.held.length > 0 && (
              <p className="text-center" style={{ fontSize: `clamp(11px, 1vw, 14px)`, color: 'var(--bd-ink-muted)' }}>
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
              <p className="font-semibold" style={{ fontSize: `clamp(16px, 1.6vw, 24px)`, color: 'var(--bd-ink)' }}>
                {currentStep.message}
              </p>
            </div>
            {currentStep.data?.category && currentStep.data?.score !== undefined && (
              <div
                className="rounded-xl animate-pulse"
                style={{
                  padding: `clamp(12px, 1.2vh, 20px)`,
                  background: '#D1FAE5',
                  border: `clamp(1.5px, 0.15vw, 2.5px) solid #22C55E`,
                }}
              >
                <p
                  className="font-bold text-center"
                  style={{ fontSize: `clamp(18px, 1.8vw, 28px)`, color: '#166534' }}
                >
                  {CATEGORY_DISPLAY_NAMES[currentStep.data.category as YahtzeeCategory] || currentStep.data.category}
                </p>
                <p
                  className="font-bold text-center"
                  style={{
                    fontSize: `clamp(22px, 2.2vw, 36px)`,
                    marginTop: `clamp(6px, 0.6vh, 10px)`,
                    color: '#16A34A',
                  }}
                >
                  +{currentStep.data.score} points
                </p>
              </div>
            )}
          </div>
        )

      default:
        return (
          <p style={{ fontSize: '1.125rem', color: 'var(--bd-ink-soft)' }}>
            {currentStep.message}
          </p>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="rounded-2xl shadow-2xl mx-4 animate-scale-in"
        style={{
          padding: `clamp(24px, 2.4vh, 40px)`,
          maxWidth: 'min(560px, 90vw)',
          width: '100%',
          background: 'var(--bd-card-warm)',
          border: `clamp(3px, 0.3vw, 5px) solid var(--bd-sun)`,
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
            className="font-bold"
            style={{ fontSize: `clamp(20px, 2vw, 32px)`, color: 'var(--bd-ink)' }}
          >
            {botName}
          </h2>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: `clamp(20px, 2vh, 32px)` }}>
          <div
            className="w-full rounded-full"
            style={{ height: `clamp(6px, 0.6vh, 10px)`, background: 'var(--bd-line)' }}
          >
            <div
              className="rounded-full transition-all duration-500"
              style={{
                width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
                height: `clamp(6px, 0.6vh, 10px)`,
                background: 'var(--bd-ink)',
              }}
            />
          </div>
          <p
            className="text-center"
            style={{
              fontSize: `clamp(10px, 0.9vw, 12px)`,
              marginTop: `clamp(6px, 0.6vh, 10px)`,
              color: 'var(--bd-ink-muted)',
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
