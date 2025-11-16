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
  const getColorClasses = () => {
    switch (event.type) {
      case 'yahtzee':
        return 'from-yellow-400 via-orange-500 to-red-500 border-yellow-500'
      case 'largeStraight':
        return 'from-blue-400 via-purple-500 to-pink-500 border-purple-500'
      case 'fullHouse':
        return 'from-green-400 via-teal-500 to-cyan-500 border-green-500'
      case 'highScore':
        return 'from-indigo-400 via-purple-500 to-pink-500 border-indigo-500'
      case 'perfectRoll':
        return 'from-amber-400 via-yellow-500 to-orange-500 border-amber-500'
      default:
        return 'from-blue-500 via-purple-600 to-pink-500 border-blue-500'
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
        className={`
          bg-gradient-to-r ${getColorClasses()}
          text-white rounded-2xl shadow-2xl px-8 py-4
          border-4 flex items-center gap-4
          animate-scale-pulse
        `}
      >
        {/* Emoji */}
        <div className="text-5xl animate-bounce">{event.emoji}</div>

        {/* Content */}
        <div>
          <h3 className="text-2xl font-bold drop-shadow-lg">{event.title}</h3>
          <p className="text-lg">
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
