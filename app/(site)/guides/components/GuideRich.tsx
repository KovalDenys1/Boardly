import Link from 'next/link'
import type { ReactNode } from 'react'
import { localizeHref, type GuideLocale } from '@/lib/seo-locales'

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

export const GUIDE_LINK_CLASS = 'font-semibold underline transition-colors hover:text-bd-coral-text'

/** The `[label](/path)` links written into a copy string, in order. */
export function guideLinks(text: string): { label: string; href: string }[] {
  return [...text.matchAll(LINK)].map((match) => ({ label: match[1], href: match[2] }))
}

/** A copy string with its `[label](/path)` links drawn as links to the page in the reader's language. */
export function GuideRich({
  text,
  locale,
  linkClassName = GUIDE_LINK_CLASS,
}: {
  text: string
  locale: GuideLocale
  linkClassName?: string
}) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <Link key={match.index} href={localizeHref(match[2], locale)} className={linkClassName} style={{ color: 'var(--bd-ink)' }}>
        {match[1]}
      </Link>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function GuideParagraph({
  text,
  locale,
  className,
  linkClassName,
}: {
  text: string
  locale: GuideLocale
  className: string
  linkClassName?: string
}) {
  return (
    <p className={className} style={{ color: 'var(--bd-ink-soft)' }}>
      <GuideRich text={text} locale={locale} linkClassName={linkClassName} />
    </p>
  )
}
