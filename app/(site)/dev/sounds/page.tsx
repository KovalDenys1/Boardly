import { notFound } from 'next/navigation'
import SoundBoard from './SoundBoard'

/** Dev-only board to hear and tune every cue in lib/sound-map.ts. Never shipped: 404 in production. */
export const metadata = { robots: { index: false, follow: false } }

export default function DevSoundsPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <SoundBoard />
}
