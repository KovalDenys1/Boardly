function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Whether this build can subscribe anybody at all.
 *
 * The VAPID public key is inlined at build time, so a deploy without it can
 * never produce a subscription — and a browser grants the notification prompt
 * once. Asking before this check spends that prompt on nothing, which is how
 * `PushSubscriptions` stayed empty in production with every opt-in looking
 * like it had worked (#983).
 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

async function createSubscription(): Promise<PushSubscription | null> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return null

  const reg = await getRegistration()
  if (!reg) return null

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
}

export type SerializedPushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

function encodeKey(key: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

/**
 * The shape `/api/push-subscriptions` stores. Either key can come back null —
 * the spec allows it and the server has nothing to deliver to without both.
 */
export function serializePushSubscription(
  subscription: PushSubscription
): SerializedPushSubscription | null {
  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  if (!p256dh || !auth) return null
  return {
    endpoint: subscription.endpoint,
    p256dh: encodeKey(p256dh),
    auth: encodeKey(auth),
  }
}

export type PushRegistrationResult =
  | 'registered'
  | 'unavailable'
  | 'unsupported'
  | 'denied'
  | 'failed'

/**
 * The whole opt-in, with one outcome the caller can act on.
 *
 * Every step that used to end in a silent `null` now names itself, so the
 * profile toggle can say what happened instead of leaving the checkbox where
 * the user put it and doing nothing.
 */
export async function subscribeAndRegisterPush(): Promise<PushRegistrationResult> {
  if (!isPushConfigured()) return 'unavailable'
  if (!isPushSupported()) return 'unsupported'

  // Straight after the check, with nothing awaited in between: browsers tie
  // the prompt to the click that caused it and quietly ignore a late request.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const subscription = await createSubscription()
    if (!subscription) return 'failed'

    const payload = serializePushSubscription(subscription)
    if (!payload) return 'failed'

    const res = await fetch('/api/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) return 'registered'

    // The browser subscription is real by this point and the server has no row for it. Left
    // there it is an orphan that answers `getExistingPushSubscription()` with "already
    // subscribed" on every later visit, which is how the end-screen ask (#984) suppressed
    // itself for good on a device nothing could ever be delivered to. `/api/push-subscriptions`
    // is rate limited, so a 429 in a burst gets here, as does any 5xx. Dropping it leaves the
    // device exactly as it was before the click, and retryable.
    try {
      await subscription.unsubscribe()
    } catch {
      // Nothing better to do: the caller already knows this attempt failed.
    }
    return 'failed'
  } catch {
    return 'failed'
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getExistingPushSubscription()
  if (!sub) return true
  return sub.unsubscribe()
}
