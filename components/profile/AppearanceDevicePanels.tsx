'use client'

import { AudioSettingsPanel } from '@/components/Header/AudioSettingsButton'
import { ThemeSettingsPanel } from '@/components/Header/ThemeToggle'
import { useTranslation } from '@/lib/i18n-helpers'

/** Theme and sound in Profile → Settings → Appearance; both are stored on the device. */
export function AppearanceDevicePanels({ surfaceClassName }: { surfaceClassName: string }) {
  const { t } = useTranslation()

  return (
    <>
      <ThemeSettingsPanel
        className={surfaceClassName}
        title={t('profile.settings.theme.title')}
        subtitle={t('profile.settings.theme.subtitle')}
      />
      <AudioSettingsPanel
        className={`${surfaceClassName} lg:col-span-2`}
        title={t('profile.settings.sound.title')}
        subtitle={t('profile.settings.sound.subtitle')}
      />
    </>
  )
}
