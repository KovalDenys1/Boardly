'use client'

import { Fragment, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { availableLocales, localeNames, type Locale } from '@/locales/meta'
import { setStoredAppearanceLocale } from '@/lib/appearance-preferences'
import { changeLanguageLazy } from '@/i18n'
import { getSafeLocalStorage } from '@/lib/safe-storage'
import { headerControl } from '@/components/Header/headerControlStyles'
import { localeSwitchHref, pathLocale } from '@/lib/seo-locales'

interface LanguageSwitcherProps {
  /** Portals the list and pins it to the button, for a parent that clips overflow. */
  anchor?: 'top end' | 'bottom end'
}

const LANGUAGE_OPTIONS: Array<{
  code: Locale
  shortLabel: string
  name: string
}> = availableLocales.map((code) => ({
  code,
  shortLabel: localeNames[code].badge,
  name: localeNames[code].name,
}))

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

export default function LanguageSwitcher({ anchor }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const pathname = usePathname() ?? '/'

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

    const stored = setStoredAppearanceLocale(getSafeLocalStorage(), nextLanguage) as Locale
    // A /ru or /uk page is in its URL's language, so another language is another URL.
    if (pathLocale(pathname)) {
      window.location.assign(localeSwitchHref(pathname, stored))
      return
    }
    void changeLanguageLazy(stored)
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        className={`${headerControl()} gap-1.5 pl-1.5 pr-2 text-left`}
        aria-label={t('header.language')}
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bd-bg2 text-bd-lav-deep dark:text-bd-lav">
          <GlobeIcon />
        </span>

        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-bd-ink-soft">
          {currentOption.shortLabel}
        </span>

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
          anchor={anchor ? { to: anchor, gap: 8 } : undefined}
          className={`z-50 overflow-hidden rounded-[1.25rem] border-[1.5px] border-bd-line bg-(--bd-input-bg) p-1.5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] focus:outline-hidden ${
            anchor ? '' : 'absolute right-0 mt-2'
          } w-[176px]`}
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
