'use client'

import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useTranslation } from '@/lib/i18n-helpers'
import { MuteToggleButton } from './AudioSettingsButton'
import { ThemeSegmented } from './ThemeToggle'

/** Theme, sound and language in one row of the drawer; the full controls live in Settings. */
export function QuickSettingsRow() {
  const { t } = useTranslation()

  return (
    <div
      role="group"
      aria-label={t('header.quickSettings')}
      className="flex shrink-0 items-center gap-2 border-t-[1.5px] border-bd-line px-4 py-2.5"
    >
      <ThemeSegmented compact />
      <MuteToggleButton />
      <div className="ml-auto">
        <LanguageSwitcher anchor="top end" />
      </div>
    </div>
  )
}
