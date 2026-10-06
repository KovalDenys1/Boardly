'use client'

import { Fragment, useMemo } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { availableLocales, type Locale } from '@/locales/meta'
import { setStoredAppearanceLocale } from '@/lib/appearance-preferences'
import { changeLanguageLazy } from '@/i18n'
import { getSafeLocalStorage } from '@/lib/safe-storage'

interface LanguageSwitcherProps {
  variant?: 'header' | 'panel'
}

// Each language's own self-name (endonym), not translated — a Russian
// speaker who can't read the current locale still needs to recognize
// "Русский" in the list, so these stay constant across all 4 locales.
const LANGUAGE_OPTIONS: Array<{
  code: Locale
  shortLabel: string
  name: string
}> = [
  { code: 'en', shortLabel: 'EN', name: 'English' },
  { code: 'uk', shortLabel: 'UA', name: 'Українська' },
  { code: 'no', shortLabel: 'NO', name: 'Norsk' },
  { code: 'ru', shortLabel: 'RU', name: 'Русский' },
]

function GlobeIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15.5 15.5 0 0 1 0 18" />
      <path d="M12 3a15.5 15.5 0 0 0 0 18" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

export default function LanguageSwitcher({ variant = 'header' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const isPanelVariant = variant === 'panel'

  const currentLocale = useMemo<Locale>(() => {
    const normalizedLanguage = i18n.language.toLowerCase()

    return (
      availableLocales.find(
        (locale) =>
          normalizedLanguage === locale || normalizedLanguage.startsWith(`${locale}-`)
      ) ?? 'en'
    )
  }, [i18n.language])

  const currentOption =
    LANGUAGE_OPTIONS.find((option) => option.code === currentLocale) ?? LANGUAGE_OPTIONS[0]

  const handleLocaleChange = (nextLanguage: Locale) => {
    if (nextLanguage === currentLocale) {
      return
    }

    void changeLanguageLazy(setStoredAppearanceLocale(getSafeLocalStorage(), nextLanguage) as Locale)
  }

  return (
    <Menu as="div" className={isPanelVariant ? 'relative w-full' : 'relative'}>
      <MenuButton
        className={
          isPanelVariant
            ? 'inline-flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-bd-line bg-(--bd-input-bg) px-3.5 py-3 text-left text-bd-ink shadow-bd-soft transition-all hover:-translate-y-0.5 hover:bg-bd-card-warm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50 dark:shadow-none'
            : 'inline-flex items-center gap-2 rounded-xl border-[1.5px] border-bd-line bg-(--bd-input-bg) px-2.5 py-2 text-left text-bd-ink shadow-[0_3px_10px_rgba(31,27,22,0.06)] transition-all hover:-translate-y-0.5 hover:bg-bd-card-warm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50 dark:shadow-none'
        }
        aria-label={t('header.language')}
      >
        <span
          className={
            isPanelVariant
              ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bd-bg2 text-bd-lav-deep dark:text-bd-lav'
              : 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bd-bg2 text-bd-lav-deep dark:text-bd-lav'
          }
        >
          <GlobeIcon />
        </span>

        {isPanelVariant ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{currentOption.name}</span>
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted">
              {currentOption.shortLabel}
            </span>
          </span>
        ) : (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-bd-ink-soft">
            {currentOption.shortLabel}
          </span>
        )}

        <span className="shrink-0 text-bd-ink-muted">
          <ChevronDownIcon />
        </span>
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1 scale-[0.98]"
        enterTo="opacity-100 translate-y-0 scale-100"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 translate-y-0 scale-100"
        leaveTo="opacity-0 translate-y-1 scale-[0.98]"
      >
        <MenuItems
          className={`absolute right-0 z-50 mt-2 overflow-hidden rounded-[1.25rem] border-[1.5px] border-bd-line bg-(--bd-input-bg) p-1.5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] focus:outline-hidden ${
            isPanelVariant ? 'w-full' : 'w-[176px]'
          }`}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const isSelected = option.code === currentLocale

            return (
              <MenuItem key={option.code}>
                {({ focus }) => (
                  <button
                    type="button"
                    onClick={() => handleLocaleChange(option.code)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-bd-lav/15 text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav'
                        : focus
                          ? 'bg-bd-card-warm text-bd-ink'
                          : 'text-bd-ink-soft'
                    }`}
                  >
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold uppercase tracking-[0.16em] ${
                        isSelected
                          ? 'bg-bd-lav text-(--bd-ink-on-accent)'
                          : 'bg-bd-bg2 text-bd-ink-muted'
                      }`}
                    >
                      {option.shortLabel}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{option.name}</span>
                    </span>

                    <span className="shrink-0">
                      {isSelected ? <CheckIcon /> : null}
                    </span>
                  </button>
                )}
              </MenuItem>
            )
          })}
        </MenuItems>
      </Transition>
    </Menu>
  )
}
