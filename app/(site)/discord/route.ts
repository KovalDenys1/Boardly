import { NextResponse } from 'next/server'
import { getDiscordInviteUrl } from '@/lib/discord'

/**
 * `/discord` – the stable address of the Discord server.
 *
 * Every surface that invites someone to Discord (the footer, the GitHub issue chooser,
 * anything printed or posted later) points here rather than at `discord.gg` directly, so a
 * rotated invite never leaves a dead link behind. The dead `discord.gg/boardly` in the
 * issue chooser is exactly what that costs when the invite is copied around instead.
 *
 * 302, not a permanent redirect: the target is expected to change, and a 301 would be
 * cached by browsers long after it did.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.redirect(getDiscordInviteUrl(), 302)
}
