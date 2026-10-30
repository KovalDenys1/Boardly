import type { GuideLocale } from '@/lib/seo-locales'
import { GuideRich } from './GuideRich'

/** The "Playing on Boardly" list: a bold label per option, then a closing line that links the game page. */
export function GuideModes({
  modes,
  more,
  locale,
  linkClassName,
}: {
  modes: { label: string; text: string }[]
  more: string
  locale: GuideLocale
  linkClassName?: string
}) {
  return (
    <div className="space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
      {modes.map(({ label, text }) => (
        <p key={label}><strong style={{ color: 'var(--bd-ink)' }}>{label}</strong> {text}</p>
      ))}
      <p><GuideRich text={more} locale={locale} linkClassName={linkClassName} /></p>
    </div>
  )
}
