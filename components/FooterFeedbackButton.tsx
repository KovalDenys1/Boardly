'use client'

import { useTranslation } from '@/lib/i18n-helpers'

export default function FooterFeedbackButton() {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
      className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-left text-sm font-semibold text-bd-lav transition-colors hover:border-bd-lav/40 hover:bg-bd-lav/10 hover:text-white"
    >
      {t('feedback.submit')}
    </button>
  )
}
