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

  // Different colors for different celebration types - with opaque backgrounds
  const getColorClasses = () => {
    switch (event.type) {
      case 'yahtzee':
        return 'from-yellow-600 via-orange-600 to-red-600 border-yellow-400 bg-opacity-95'
      case 'largeStraight':
        return 'from-blue-600 via-purple-600 to-pink-600 border-purple-400 bg-opacity-95'
      case 'fullHouse':
        return 'from-green-600 via-teal-600 to-cyan-600 border-green-400 bg-opacity-95'
      case 'highScore':
        return 'from-indigo-600 via-purple-600 to-pink-600 border-indigo-400 bg-opacity-95'
      case 'perfectRoll':
        return 'from-amber-600 via-yellow-600 to-orange-600 border-amber-400 bg-opacity-95'
      default:
        return 'from-blue-600 via-purple-700 to-pink-600 border-blue-400 bg-opacity-95'
    }
  }

  return (
    <div
      className={`
        fixed top-20 left-1/2 transform -translate-x-1/2 z-50
        ${visible ? 'animate-bounce-in' : 'animate-fade-out'}
      `}
    >
      <div
        className={`bg-gradient-to-r ${getColorClasses()} text-white rounded-2xl shadow-2xl flex items-center animate-scale-pulse border-2`}
        style={{
          padding: `clamp(12px, 1.2vh, 20px) clamp(24px, 2.4vw, 40px)`,
          gap: `clamp(12px, 1.2vw, 20px)`,
          backdropFilter: 'blur(4px)',
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
