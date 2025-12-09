'use client'

import React, { useEffect, useState } from 'react'
import { CelebrationEvent, getCategoryDisplayName } from '@/lib/celebrations'

interface CelebrationBannerProps {
  event: CelebrationEvent | null
  onComplete: () => void
}

export default function CelebrationBanner({ event, onComplete }: CelebrationBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (event) {
      // Show banner
      setVisible(true)

      // Auto-hide after 2.5 seconds
      const timer = setTimeout(() => {
        setVisible(false)
        // Wait for fade-out animation, then notify parent
        setTimeout(onComplete, 300)
      }, 2500)

      return () => clearTimeout(timer)
    }
  }, [event, onComplete])

  if (!event || !visible) return null

  // Different colors for different celebration types
  const getGradientStyle = () => {
    switch (event.type) {
      case 'yahtzee':
        return {
          backgroundImage: 'linear-gradient(to right, #FBBF24, #F97316, #EF4444)',
          borderColor: '#FBBF24',
        }
      case 'largeStraight':
        return {
          backgroundImage: 'linear-gradient(to right, #60A5FA, #A855F7, #EC4899)',
          borderColor: '#A855F7',
        }
      case 'fullHouse':
        return {
          backgroundImage: 'linear-gradient(to right, #4ADE80, #14B8A6, #06B6D4)',
          borderColor: '#4ADE80',
        }
      case 'highScore':
        return {
          backgroundImage: 'linear-gradient(to right, #818CF8, #A855F7, #EC4899)',
          borderColor: '#818CF8',
        }
      case 'perfectRoll':
        return {
          backgroundImage: 'linear-gradient(to right, #FBBF24, #EAB308, #F97316)',
          borderColor: '#FBBF24',
        }
      default:
        return {
          backgroundImage: 'linear-gradient(to right, #3B82F6, #9333EA, #EC4899)',
          borderColor: '#3B82F6',
        }
    }
  }

  const gradientStyle = getGradientStyle()

  return (
    <div
      className={`
        fixed top-20 left-1/2 transform -translate-x-1/2 z-50
        ${visible ? 'animate-bounce-in opacity-100' : 'animate-fade-out opacity-0'}
      `}
    >
      <div
        className="text-white rounded-2xl shadow-2xl flex items-center border-solid backdrop-blur-sm"
        style={{
          ...gradientStyle,
          padding: `clamp(12px, 1.2vh, 20px) clamp(24px, 2.4vw, 40px)`,
          gap: `clamp(12px, 1.2vw, 20px)`,
          borderWidth: `clamp(3px, 0.3vw, 5px)`,
          borderStyle: 'solid',
          animation: visible ? 'scale-pulse 0.8s ease-in-out infinite' : 'none',
          opacity: 1,
        }}
      >
        {/* Emoji */}
        <div
          style={{
            fontSize: `clamp(32px, 3.5vw, 56px)`,
          }}
          className="animate-bounce"
        >
          {event.emoji}
        </div>

        {/* Content */}
        <div>
          <h3
            className="font-bold drop-shadow-lg"
            style={{
              fontSize: `clamp(18px, 1.8vw, 28px)`,
            }}
          >
            {event.title}
          </h3>
          <p
            style={{
              fontSize: `clamp(14px, 1.4vw, 20px)`,
            }}
          >
            {event.category && (
              <span className="font-semibold">{getCategoryDisplayName(event.category)} • </span>
            )}
            <span className="text-yellow-100 font-bold">+{event.score} points</span>
          </p>
        </div>
      </div>
    </div>
  )
}
