import { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { ANNOUNCEMENTS_TAG } from '@/lib/runtime-config'
import { controlPanelJson, guardControlPanelRequest } from '@/lib/server/control-panel-api'

/**
 * Expires every page that shows the announcement banner, so a banner the Control Panel
 * publishes or takes down reaches players on their next request instead of within the hour.
 *
 * 200 `{ revalidated: true }`. No body.
 */
export async function POST(request: NextRequest) {
  const guardError = await guardControlPanelRequest(request)
  if (guardError) return guardError

  revalidateTag(ANNOUNCEMENTS_TAG, { expire: 0 })
  return controlPanelJson({ revalidated: true })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
