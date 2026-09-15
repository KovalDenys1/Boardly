/**
 * One share path for every invite affordance (#927).
 *
 * The link, the share marker and the event stay the ones the invite loop already owns
 * (#920, lib/invite-attribution.ts). The Web Share sheet is an affordance on top of the
 * clipboard copy, not a second mechanism: same `?via=invite` URL, same `invite_copied`
 * event, so attribution and the funnel keep working unchanged and `method` in the payload
 * is the only new thing to read.
 *
 * Web Share where the browser has it (iOS Safari, Android Chrome) puts the invite into
 * WhatsApp, Telegram, Discord or Teams in one tap, which is what the share sheet is worth;
 * every desktop browser lacks it, so the clipboard stays the fallback rather than a
 * hand-rolled list of per-app deep links that would each need their own maintenance.
 */

import { buildInviteLink } from './invite-attribution'

/** How the invite actually left the page. Goes into the `invite_copied` payload. */
export type InviteShareMethod = 'web_share' | 'clipboard'

/**
 * `dismissed` is the share sheet cancelled by the person – not a failure and not an
 * invite, so it fires no event and shows no toast.
 */
export type InviteShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

export interface InviteSharePayload {
  title: string
  text: string
  url: string
}

/** The slice of `navigator` this module uses, so the decision is testable without a browser. */
export interface InviteShareNavigator {
  share?: (data: InviteSharePayload) => Promise<void>
  canShare?: (data: InviteSharePayload) => boolean
  clipboard?: { writeText: (text: string) => Promise<void> }
}

export function buildInviteSharePayload(input: {
  code: string
  origin: string
  title: string
  text: string
}): InviteSharePayload {
  return {
    title: input.title,
    text: input.text,
    url: buildInviteLink(input.code, input.origin),
  }
}

/**
 * True when this browser can hand the payload to the OS share sheet. `canShare` is checked
 * when present because a browser may expose `share` and still refuse a given payload.
 */
export function canShareInvite(
  nav: InviteShareNavigator | null | undefined,
  payload: InviteSharePayload
): boolean {
  if (typeof nav?.share !== 'function') return false
  if (typeof nav.canShare !== 'function') return true
  try {
    return nav.canShare(payload)
  } catch {
    return false
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function copyToClipboard(
  nav: InviteShareNavigator | null | undefined,
  payload: InviteSharePayload
): Promise<InviteShareOutcome> {
  if (typeof nav?.clipboard?.writeText !== 'function') return 'failed'
  try {
    await nav.clipboard.writeText(payload.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/**
 * Shares the invite through the OS share sheet, falling back to the clipboard.
 *
 * A share sheet that errors for any reason other than the person cancelling still falls
 * back to the clipboard: some in-app browsers expose `share` and then reject it, and the
 * person must not be left with nothing after tapping an invite button.
 */
export async function shareInvite(input: {
  payload: InviteSharePayload
  navigator: InviteShareNavigator | null | undefined
}): Promise<InviteShareOutcome> {
  const { payload, navigator: nav } = input

  if (canShareInvite(nav, payload)) {
    try {
      await nav!.share!(payload)
      return 'shared'
    } catch (error) {
      if (isAbort(error)) return 'dismissed'
    }
  }

  return copyToClipboard(nav, payload)
}
