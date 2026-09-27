import { NextResponse } from 'next/server'
import { getRealtimeVerifyKey } from '@/lib/server/realtime-signing'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * The public key every realtime broadcast is verified with
 * (GHSA-g868-9224-wr3p, lib/client/realtime-verify.ts).
 *
 * Public on purpose: it is the half of the key that can only check a
 * signature, never make one. `serverTime` rides along so the client can place
 * the server's `iat` stamps on its own clock – that is what lets it refuse a
 * genuine message recorded earlier and played back now – which is also why the
 * response must not be cached.
 */
export async function GET() {
  let key: ReturnType<typeof getRealtimeVerifyKey>
  try {
    key = getRealtimeVerifyKey()
  } catch {
    key = null
  }

  if (!key) {
    return NextResponse.json({ error: 'Realtime signing is not configured' }, { status: 503, headers: NO_STORE })
  }

  return NextResponse.json(
    {
      kid: key.kid,
      jwk: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y },
      serverTime: Date.now(),
    },
    { headers: NO_STORE }
  )
}
