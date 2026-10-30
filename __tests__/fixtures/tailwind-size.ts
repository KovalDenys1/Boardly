/**
 * jsdom lays nothing out, so a size a test cares about is read from the Tailwind classes
 * that set it. Only unprefixed classes count: they are the phone size, the smallest one.
 */

const FONT_SIZE_PX: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
}

function baseClasses(el: Element): string[] {
  return Array.from(el.classList).filter((name) => !name.includes(':'))
}

function ownFontSizePx(el: Element): number | null {
  for (const name of baseClasses(el)) {
    if (name in FONT_SIZE_PX) return FONT_SIZE_PX[name]
    const arbitrary = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(name)
    if (arbitrary) return Number(arbitrary[1])
  }
  return null
}

/** The font size an element renders at on a phone: its own class, else the nearest ancestor's, else the 16px root. */
export function fontSizePx(el: Element): number {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const size = ownFontSizePx(node)
    if (size !== null) return size
  }
  return 16
}

function spacingPx(value: string): number | null {
  const step = /^(\d+(?:\.\d+)?)$/.exec(value)
  if (step) return Number(step[1]) * 4
  const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(value)
  if (arbitrary) return Number(arbitrary[1])
  return null
}

/** The smallest height or width an element's own classes guarantee (`h-*`, `min-h-*`, `size-*`). */
export function guaranteedPx(el: Element, axis: 'height' | 'width'): number {
  const prefixes = axis === 'height' ? ['h-', 'min-h-', 'size-'] : ['w-', 'min-w-', 'size-']
  let best = 0
  for (const name of baseClasses(el)) {
    for (const prefix of prefixes) {
      if (!name.startsWith(prefix)) continue
      const px = spacingPx(name.slice(prefix.length))
      if (px !== null) best = Math.max(best, px)
    }
  }
  return best
}
