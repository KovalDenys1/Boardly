'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { availableLocales } from '@/locales'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = e.target.value
    localStorage.setItem('language', nextLanguage)
    localStorage.setItem('i18nextLng', nextLanguage)
    void i18n.changeLanguage(nextLanguage)
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
    <div className="relative min-w-[138px] max-w-[156px]">
      <select
        value={i18n.language}
        onChange={handleLocaleChange}
        className="w-full appearance-none rounded-xl border border-white/30 bg-white/24 px-3 py-2 pr-9 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.18),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md outline-none transition hover:bg-white/28 focus:border-white/40 focus:bg-white/32 focus:ring-2 focus:ring-white/25"
        aria-label="Select language"
      >
        {availableLocales.map((loc) => (
          <option key={loc} value={loc} className="bg-slate-900 text-white">
            {getLanguageLabel(loc)} — {getLanguageName(loc)}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-white/70"
      >
        ▾
      </span>
    </div>
  )
}
