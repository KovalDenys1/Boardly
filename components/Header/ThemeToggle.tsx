'use client'

import { Fragment, useEffect, useState } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { type ThemeMode, getStoredThemeMode, applyThemeMode, THEME_STORAGE_KEY, DARK_MEDIA_QUERY } from '@/lib/theme'
import { useTranslation } from '@/lib/i18n-helpers'
import { getSafeLocalStorage, writeLocal } from '@/lib/safe-storage'
import { headerControl } from './headerControlStyles'

const THEME_CHANGED_EVENT = 'boardly:theme-changed'

function SunIcon() {
  return (
    <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

const NO_TRANSITIONS_CSS = '*,*::before,*::after{transition:none!important}'

/** Swaps the theme with every transition off for one frame, so the colors do not smear across the page. */
function applyWithoutTransitions(next: ThemeMode) {
  const style = document.createElement('style')
  style.textContent = NO_TRANSITIONS_CSS
  document.head.appendChild(style)
  applyThemeMode(next)
  void window.getComputedStyle(document.body).opacity
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
}

function readResolvedTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMode(getStoredThemeMode(getSafeLocalStorage() ?? undefined))
    setResolved(readResolvedTheme())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia(DARK_MEDIA_QUERY)
    const handler = () => {
      const stored = getStoredThemeMode(getSafeLocalStorage() ?? undefined)
      if (stored === 'system') applyThemeMode('system')
      setResolved(readResolvedTheme())
    }
    const sync = () => {
      setMode(getStoredThemeMode(getSafeLocalStorage() ?? undefined))
      setResolved(readResolvedTheme())
    }
    mq.addEventListener('change', handler)
    window.addEventListener(THEME_CHANGED_EVENT, sync)
    return () => {
      mq.removeEventListener('change', handler)
      window.removeEventListener(THEME_CHANGED_EVENT, sync)
    }
  }, [mounted])

  const setTheme = (next: ThemeMode) => {
    writeLocal(THEME_STORAGE_KEY, next)
    applyWithoutTransitions(next)
    setMode(next)
    setResolved(readResolvedTheme())
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT))
  }

  return { mode, resolved, mounted, setTheme }
}

function CheckIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

const MENU_OPTIONS: {
  value: ThemeMode
  labelKey: 'header.themeLight' | 'header.themeSystem' | 'header.themeDark'
  hintKey?: 'header.themeSystemHint'
  Icon: React.FC
}[] = [
  { value: 'light', labelKey: 'header.themeLight', Icon: SunIcon },
  { value: 'dark', labelKey: 'header.themeDark', Icon: MoonIcon },
  { value: 'system', labelKey: 'header.themeSystem', hintKey: 'header.themeSystemHint', Icon: SystemIcon },
]

/**
 * The header's theme control: the trigger shows the theme on screen now (sun or moon),
 * and opens a menu that names Light, Dark and System, with the active one checked.
 */
export function ThemeToggle() {
  const { t } = useTranslation()
  const { mode, resolved, mounted, setTheme } = useThemeMode()

  if (!mounted) return <div aria-hidden className="h-9 w-9 shrink-0" />

  const TriggerIcon = resolved === 'dark' ? MoonIcon : SunIcon
  const label = t(mode === 'light' ? 'header.themeLight' : mode === 'dark' ? 'header.themeDark' : 'header.themeSystem')
  const current = t('header.themeCurrent', { mode: label })

  return (
    <Menu as="div" className="relative">
      <MenuButton className={`${headerControl({ square: true })} relative`} aria-label={current} title={current}>
        <TriggerIcon />
        <span
          aria-hidden
          className={`absolute bottom-[5px] right-[5px] h-1.5 w-1.5 rounded-full bg-bd-lav transition-[opacity,scale] duration-bd-fast ease-out ${
            mode === 'system' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-bd-fast"
        enterFrom="opacity-0 translate-y-1 scale-[0.98]"
        enterTo="opacity-100 translate-y-0 scale-100"
        leave="transition ease-in duration-bd-fast"
        leaveFrom="opacity-100 translate-y-0 scale-100"
        leaveTo="opacity-0 translate-y-1 scale-[0.98]"
      >
        <MenuItems className="absolute right-0 z-dropdown mt-2 w-[232px] overflow-hidden rounded-[1.25rem] border-[1.5px] border-bd-line bg-bd-input-bg p-1.5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] focus:outline-hidden">
          <div className="px-3 pb-1.5 pt-1 text-xs font-semibold text-bd-ink-muted">{t('header.themeLabel')}</div>
          {MENU_OPTIONS.map(({ value, labelKey, hintKey, Icon }) => {
            const active = mode === value
            return (
              <MenuItem key={value}>
                {({ focus }) => (
                  <button
                    type="button"
                    onClick={() => setTheme(value)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-bd-fast ${
                      active
                        ? 'bg-bd-lav/15 text-bd-lav-text dark:text-bd-lav'
                        : focus
                          ? 'bg-bd-card-warm text-bd-ink'
                          : 'text-bd-ink-soft'
                    }`}
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bd-bg2">
                      <Icon />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t(labelKey)}</span>
                      {hintKey && <span className="block text-xs text-bd-ink-muted">{t(hintKey)}</span>}
                    </span>
                    <span className={`shrink-0 transition-opacity duration-bd-fast ${active ? 'opacity-100' : 'opacity-0'}`}>
                      <CheckIcon />
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

const THEME_OPTIONS: { value: ThemeMode; labelKey: 'header.themeLight' | 'header.themeSystem' | 'header.themeDark'; Icon: React.FC }[] = [
  { value: 'light', labelKey: 'header.themeLight', Icon: SunIcon },
  { value: 'system', labelKey: 'header.themeSystem', Icon: SystemIcon },
  { value: 'dark', labelKey: 'header.themeDark', Icon: MoonIcon },
]

const focusRing = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep'

/**
 * Light / System / Dark as one segmented control. `compact` shows icons only, for a
 * row that has to share its width; the full form adds the label under each icon.
 */
export function ThemeSegmented({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { mode, mounted, setTheme } = useThemeMode()

  if (!mounted) {
    return <div aria-hidden className={compact ? 'h-9 w-[118px]' : 'h-[66px]'} />
  }

  return (
    <div
      role="group"
      aria-label={t('header.themeLabel')}
      className={compact ? 'inline-flex h-9 rounded-xl border-[1.5px] border-bd-line bg-bd-bg p-0.5' : 'grid grid-cols-3 gap-1.5'}
    >
      {THEME_OPTIONS.map(({ value, labelKey, Icon }) => {
        const active = mode === value
        const label = t(labelKey)
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={
              compact
                ? `flex h-full w-9 items-center justify-center rounded-[9px] transition-colors ${
                    active ? 'bg-bd-ink text-bd-bg' : 'text-bd-ink-muted hover:bg-bd-bg2 hover:text-bd-ink'
                  } ${focusRing}`
                : `flex flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] px-1 py-2 text-[11px] transition-colors ${
                    active
                      ? 'border-bd-ink bg-bd-bg2 font-bold text-bd-ink'
                      : 'border-bd-line bg-transparent font-medium text-bd-ink-muted hover:bg-bd-bg2'
                  } ${focusRing}`
            }
          >
            <Icon />
            {!compact && label}
          </button>
        )
      })}
    </div>
  )
}

interface ThemeSettingsPanelProps {
  title: string
  subtitle?: string
  className?: string
}

/** The full three-tile theme picker, for a settings surface. */
export function ThemeSettingsPanel({ title, subtitle, className = '' }: ThemeSettingsPanelProps) {
  return (
    <div className={className}>
      <p className="mb-2 block text-sm font-semibold text-bd-ink">{title}</p>
      {subtitle && <p className="mb-3 text-sm text-bd-ink-soft">{subtitle}</p>}
      <ThemeSegmented />
    </div>
  )
}
