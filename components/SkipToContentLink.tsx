'use client'

import { useTranslation } from '@/lib/i18n-helpers'

/**
 * WCAG 2.4.1 (Bypass Blocks) / forskrift om universell utforming § 4 (#1171).
 *
 * Visually hidden until it receives focus, so it never shifts layout for a
 * sighted mouse user, but it is the very first focusable element in the
 * document for anyone tabbing from the top of the page or using a screen
 * reader's "next landmark" navigation.
 */
export default function SkipToContentLink() {
  const { t } = useTranslation()

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[999] focus:rounded-bd-sm focus:bg-bd-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-bd-bg focus:shadow-bd-pop"
    >
      {t('common.skipToContent')}
    </a>
  )
}
