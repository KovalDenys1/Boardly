'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { availableLocales } from '@/locales'
import { setStoredAppearanceLocale } from '@/lib/appearance-preferences'

interface LanguageSwitcherProps {
  variant?: 'header' | 'panel'
}

export default function LanguageSwitcher({ variant = 'header' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const isPanelVariant = variant === 'panel'

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = e.target.value
    void i18n.changeLanguage(setStoredAppearanceLocale(localStorage, nextLanguage))
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
    <div className={isPanelVariant ? 'relative w-full' : 'relative min-w-[138px] max-w-[156px]'}>
      <select
        value={i18n.language}
        onChange={handleLocaleChange}
        className={
          isPanelVariant
            ? 'w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:focus:border-blue-400 dark:focus:ring-blue-500/20'
            : 'w-full appearance-none rounded-xl border border-white/30 bg-white/[0.24] px-3 py-2 pr-9 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.18),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md outline-none transition hover:bg-white/[0.28] focus:border-white/40 focus:bg-white/[0.32] focus:ring-2 focus:ring-white/25'
        }
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
        className={
          isPanelVariant
            ? 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500 dark:text-slate-400'
            : 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-white/70'
        }
      >
        ▾
      </span>
    </div>
  )
}
