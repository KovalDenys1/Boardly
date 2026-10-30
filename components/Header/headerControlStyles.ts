interface HeaderControlOptions {
  /** A 36×36 icon button instead of a padded text button. */
  square?: boolean
  border?: string
  surface?: string
  text?: string
}

/**
 * One box for every control in the header's right-hand group: 36px tall, 12px radius,
 * 1.5px border, the same hover, open, press and focus treatment. The tone slots replace
 * the defaults whole, because the project has no class merger to settle two `bg-*`.
 */
export function headerControl({
  square = false,
  border = 'border-bd-line',
  surface = 'bg-bd-card-warm hover:bg-bd-bg2 data-open:bg-bd-bg2',
  text = 'text-bd-ink-soft hover:text-bd-ink data-open:text-bd-ink',
}: HeaderControlOptions = {}) {
  return [
    'inline-flex h-9 shrink-0 items-center justify-center rounded-xl border-[1.5px]',
    'transition-[background-color,color,border-color,scale] duration-bd-fast ease-out',
    'motion-safe:enabled:active:scale-[0.96]',
    'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep',
    '[-webkit-tap-highlight-color:transparent]',
    square ? 'w-9' : '',
    border,
    surface,
    text,
  ]
    .filter(Boolean)
    .join(' ')
}

/** The guest menu's button, shared with the placeholder that holds its place while the menu loads. */
export const guestMenuButtonClass = `${headerControl({ border: 'border-bd-sun-deep/40', surface: 'bg-bd-sun/22 hover:bg-bd-sun/35 data-open:bg-bd-sun/35' })} max-w-[140px] gap-2 px-3 text-[13px] font-semibold`
