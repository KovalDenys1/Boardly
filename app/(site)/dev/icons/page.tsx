import { notFound } from 'next/navigation'
import IconSheet from './IconSheet'

/**
 * Dev-only contact sheet for the icon system (components/icons, GameIcon).
 * Every glyph at every size, in light, dark and the premium lobby themes –
 * the visual review gate for icon PRs. Never shipped: 404 in production.
 */
export const metadata = { robots: { index: false, follow: false } }

export default function DevIconsPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <IconSheet />
}
