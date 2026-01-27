'use client'
import { useTranslation } from '@/lib/i18n-helpers'

export default function FeaturesGrid() {
  const { t } = useTranslation()
  
  const features = [
    {
      emoji: '⚡',
      titleKey: 'home.features.realTime.title',
      descriptionKey: 'home.features.realTime.description',
      delay: '0s'
    },
    {
      emoji: '📥',
      titleKey: 'home.features.noDownload.title',
      descriptionKey: 'home.features.noDownload.description',
      delay: '0.1s'
    },
    {
      emoji: '👥',
      titleKey: 'home.features.multiplayer.title',
      descriptionKey: 'home.features.multiplayer.description',
      delay: '0.2s'
    },
    {
      emoji: '🤖',
      titleKey: 'home.features.aiOpponents.title',
      descriptionKey: 'home.features.aiOpponents.description',
      delay: '0.3s'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
      {features.map((feature, index) => (
        <div 
          key={index}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105 animate-fade-in" 
          style={{ 
            animationDelay: feature.delay,
            minHeight: '200px', // Fixed height to prevent CLS
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div className="text-4xl mb-4" style={{ height: '3rem', display: 'flex', alignItems: 'center' }}>{feature.emoji}</div>
          <h3 className="text-xl font-bold mb-2" style={{ minHeight: '1.75rem' }}>{t(feature.titleKey as any)}</h3>
          <p className="text-white/80 text-sm" style={{ minHeight: '3rem' }}>{t(feature.descriptionKey as any)}</p>
        </div>
      ))}
    </div>
  )
}
