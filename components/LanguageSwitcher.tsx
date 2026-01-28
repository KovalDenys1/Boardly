'use client'


import { useTranslation } from '@/lib/i18n-helpers'
import { availableLocales } from '@/locales'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value)
  }

  const getLanguageLabel = (loc: string) => {
    switch (loc) {
      case 'en':
        return 'EN'
      case 'uk':
        return 'UA'
      case 'no':
        return 'NO'
      case 'ru':
        return 'RU'
      default:
        return loc.toUpperCase()
    }
  }

  const getLanguageName = (loc: string) => {
    switch (loc) {
      case 'en':
        return 'English'
      case 'uk':
        return 'Ukrainian'
      case 'no':
        return 'Norwegian'
      case 'ru':
        return 'Russian'
      default:
        return loc
    }
  }

  return (
    <div className="bg-white/10 rounded-lg p-1">
      <select
        value={i18n.language}
        onChange={handleLocaleChange}
        className="px-3 py-1.5 rounded-md text-sm font-medium bg-transparent text-white focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer max-w-[150px] truncate"
        aria-label="Select language"
      >
        {availableLocales.map((loc) => (
          <option key={loc} value={loc} className="text-black bg-white">
            {getLanguageLabel(loc)} — {getLanguageName(loc)}
          </option>
        ))}
      </select>
    </div>
  )
}
