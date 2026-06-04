import webpush from 'web-push'
import { prisma } from './db'
import { logger } from './logger'
import { getNotificationPreferences } from './notification-preferences'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID environment variables are not configured')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

export async function sendPushNotification(userId: string, payload: PushPayload): Promise<void> {
  try {
    const prefs = await getNotificationPreferences(userId)
    if (prefs.unsubscribedAll || !prefs.pushNotifications) return

    const subscriptions = await prisma.pushSubscriptions.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (subscriptions.length === 0) return

    ensureVapid()

    const staleIds: string[] = []

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            { TTL: 86400 },
          )
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(sub.id)
          } else {
            logger.error('Push delivery failed', err as Error, {
              userId,
              endpoint: sub.endpoint.slice(0, 40),
              statusCode,
            })
          }
        }
      }),
    )

    if (staleIds.length > 0) {
      await prisma.pushSubscriptions.deleteMany({ where: { id: { in: staleIds } } })
    }
  } catch (err) {
    logger.error('sendPushNotification unexpected error', err as Error, { userId })
  }
}
