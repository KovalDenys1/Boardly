import Link from 'next/link'

export type Crumb = {
  label: string
  /** Without one, the crumb is the page itself. */
  href?: string
}

type BreadcrumbsProps = {
  items: Crumb[]
  /** The landmark's name, `t('breadcrumbs.label')`; a prop so server components can use it too. */
  label: string
  /** 12px text for a toolbar row; 14px otherwise. */
  compact?: boolean
  className?: string
}

/**
 * The site's one breadcrumb (#1561, #1563): text crumbs with 24px targets that wrap onto a
 * second line rather than cut the last crumb short.
 */
export default function Breadcrumbs({ items, label, compact = false, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={`${compact ? 'text-xs' : 'text-sm'} min-w-0 text-bd-ink-soft ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-0.5">
              {item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md px-1 font-medium underline-offset-2 transition-colors hover:text-bd-ink hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="inline-flex min-h-6 items-center px-1 font-semibold text-bd-ink">
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-bd-ink-muted">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
