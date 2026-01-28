'use client'
import { useTranslation } from '@/lib/i18n-helpers'

export default function HowItWorks() {
  const { t } = useTranslation()
  
  const steps = [
    {
      number: 1,
      bgColor: 'bg-blue-500',
      titleKey: 'home.howItWorks.step1.title',
      descriptionKey: 'home.howItWorks.step1.description'
    },
    {
      number: 2,
      bgColor: 'bg-purple-500',
      titleKey: 'home.howItWorks.step2.title',
      descriptionKey: 'home.howItWorks.step2.description'
    },
    {
      number: 3,
      bgColor: 'bg-pink-500',
      titleKey: 'home.howItWorks.step3.title',
      descriptionKey: 'home.howItWorks.step3.description'
    }
  ]

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 md:p-8 text-white" style={{ minHeight: 'unset' }}>
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-8" style={{ minHeight: 'clamp(2rem, 5vw, 3rem)' }}>{t('home.howItWorks.title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((step) => (
          <div key={step.number} className="text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${step.bgColor} text-white font-bold text-2xl mb-4 shadow-lg`} style={{ width: '64px', height: '64px' }}>
              {step.number}
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ minHeight: '1.75rem' }}>{t(step.titleKey as any)}</h3>
            <p className="text-white/80 mb-0">{t(step.descriptionKey as any)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
