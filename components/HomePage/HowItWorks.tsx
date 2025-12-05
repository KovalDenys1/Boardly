'use client'
import { useTranslation } from 'react-i18next'

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
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 md:p-12 text-white animate-slide-in-up">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{t('home.howItWorks.title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step) => (
          <div key={step.number} className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${step.bgColor} text-white font-bold text-2xl mb-4 shadow-lg`}>
              {step.number}
            </div>
            <h3 className="text-xl font-bold mb-2">{t(step.titleKey)}</h3>
            <p className="text-white/80">{t(step.descriptionKey)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
