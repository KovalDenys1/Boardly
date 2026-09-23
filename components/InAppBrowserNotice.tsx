'use client'

import { useEffect, useState } from 'react'

import { useTranslation } from '@/lib/i18n-helpers'
import { withInAppHandoffSource } from '@/lib/signup-source'
import { captureSignupSource } from '@/lib/signup-source-client'
import { detectInAppBrowser, type InAppBrowser } from '@/lib/social-referrers'

/** Brand names, spelled the same in every locale. */
const APP_NAMES: Record<InAppBrowser, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
}

/**
 * Shown above the OAuth buttons only inside a social app's embedded browser (#1091).
 *
 * Google refuses OAuth in embedded webviews (`403 disallowed_useragent`), so a visitor
 * who arrives from an Instagram or TikTok post and taps "Google" lands on Google's error
 * page with no way back. A page cannot open the system browser from inside those apps,
 * so the notice says how, offers the link on the clipboard, and names the providers that
 * do work there. Detection runs after mount: the server cannot know, and rendering it
 * during hydration would mismatch.
 */
export default function InAppBrowserNotice() {
  const { t } = useTranslation()
  const [app, setApp] = useState<InAppBrowser | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setApp(detectInAppBrowser(navigator.userAgent))
  }, [])

  if (!app) return null

  const copyLink = async () => {
    try {
      // The attribution is in memory and dies with this webview; the link carries it over.
      await navigator.clipboard.writeText(
        withInAppHandoffSource(window.location.href, captureSignupSource())
      )
      setCopied(true)
    } catch {
      // Clipboard blocked in this webview: the instructions above still apply.
    }
  }

  return (
    <div
      role="note"
      className="rounded-2xl p-4 text-sm"
      style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink)' }}
    >
      <p className="font-semibold">{t('auth.inAppBrowser.title', { app: APP_NAMES[app] })}</p>
      <p className="mt-1 leading-6" style={{ color: 'var(--bd-ink-soft)' }}>
        {t('auth.inAppBrowser.body')}
      </p>
      <button
        type="button"
        onClick={copyLink}
        className="mt-3 min-h-[44px] rounded-xl px-4 font-semibold"
        style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg)' }}
        aria-live="polite"
      >
        {copied ? t('auth.inAppBrowser.copied') : t('auth.inAppBrowser.copyLink')}
      </button>
    </div>
  )
}
