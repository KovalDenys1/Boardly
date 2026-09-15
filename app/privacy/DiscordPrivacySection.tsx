'use client'

import { useTranslation } from '@/lib/i18n-helpers'

/**
 * The Discord paragraphs of the privacy policy (#945).
 *
 * The policy page is a server component with English copy; i18n runs in the browser
 * (i18next + language detector, see i18n.ts), so the one localized section is a small
 * client island rather than a rewrite of the page – which keeps the route prerendered.
 * Two facts live here and nowhere else: the public-lobby feed and the self-hosted bot
 * that publishes it. Linked Roles (#939) has not shipped, so nothing is claimed about it.
 */
export default function DiscordPrivacySection() {
  const { t } = useTranslation()
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>
        {t('privacyPolicy.discord.title')}
      </h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>{t('privacyPolicy.discord.feed')}</li>
        <li>{t('privacyPolicy.discord.bot')}</li>
      </ul>
    </section>
  )
}
