'use client'

import { useTranslation } from 'react-i18next'
import { locales } from '@/i18n'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleLocaleChange = (newLocale: string) => {
    i18n.changeLanguage(newLocale)
  }

  return (
    <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => handleLocaleChange(loc)}
          className={`
            px-3 py-1.5 rounded-md text-sm font-medium transition-all
            ${
              i18n.language === loc
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }
          `}
          aria-label={`Switch to ${loc === 'en' ? 'English' : 'Ukrainian'}`}
        >
          {loc === 'en' ? 'EN' : 'UA'}
        </button>
      ))}
    </div>
  )
}
