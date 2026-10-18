import { getActiveAnnouncement } from '@/lib/runtime-config'
import { AnnouncementMessage } from '@/components/AnnouncementMessage'

/**
 * A single line above the header, when there is something to say.
 *
 * Written from the control panel, so a launch or an outage can be announced without a
 * deploy. It renders nothing at all when there is no live announcement, which is almost
 * always, and it is a server component so it costs a cached read rather than a round trip
 * from the browser.
 *
 * Deliberately not dismissible. A dismissal needs per-viewer storage to be worth anything,
 * and the only announcements worth the top of every page are the ones that should stay until
 * they are taken down. If that turns out to be wrong, the fix is a dismissal key on the row,
 * not a localStorage flag that forgets on another device.
 */
export async function AnnouncementBanner() {
  const announcement = await getActiveAnnouncement()
  if (!announcement) return null

  const tone = {
    info: 'bg-(--color-surface-2) text-(--color-text) border-(--color-border)',
    success: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-100 border-amber-500/30',
  }[announcement.tone]

  return (
    <div role="status" className={`border-b ${tone}`}>
      <AnnouncementMessage message={announcement.message} href={announcement.href || null} />
    </div>
  )
}
