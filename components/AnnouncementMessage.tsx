'use client'

import Link from 'next/link'
import { useIsPlayApp } from '@/hooks/useIsPlayApp'
import { isPurchaseHref } from '@/lib/app-shell'

export function AnnouncementMessage({ message, href }: { message: string; href: string | null }) {
  const inPlayApp = useIsPlayApp()
  const linked = href !== null && !(inPlayApp && isPurchaseHref(href, window.location.origin))

  const body = (
    <span className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-2 text-center text-sm">
      {message}
      {linked && <span aria-hidden="true">&rarr;</span>}
    </span>
  )

  if (!linked) return body

  return (
    <Link
      href={href}
      className="block hover:underline"
      data-purchase-ui={(!inPlayApp && isPurchaseHref(href)) || undefined}
    >
      {body}
    </Link>
  )
}
