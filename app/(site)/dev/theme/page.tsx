import { notFound } from 'next/navigation'
import ThemePanel from './ThemePanel'

/**
 * Dev-only theme workbench. Boardly's visual language is 20 colour custom
 * properties, so a palette change is a question about those twenty values and
 * nothing else – this moves them with HSL sliders against a strip of real UI
 * and hands back a CSS diff to paste into `app/globals.css`.
 *
 * The diff is the point. Recolouring a browser tab proves nothing; the panel
 * earns its place by ending with something committable.
 *
 * Never shipped: 404 in production, the same guard `/dev/icons` uses.
 */
export const metadata = { robots: { index: false, follow: false } }

export default function DevThemePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ThemePanel />
}
