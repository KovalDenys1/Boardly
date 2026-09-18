/**
 * @jest-environment jsdom
 */
import {
  isPushSupported,
  isPushConfigured,
  getPushPermissionState,
  serializePushSubscription,
  subscribeAndRegisterPush,
} from '@/lib/push-subscription'

const originalEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

describe('push-subscription', () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalEnv
    jest.restoreAllMocks()
  })

  describe('isPushSupported / getPushPermissionState', () => {
    it('reports unsupported when the Notification API is missing', () => {
      const original = (window as unknown as { Notification?: unknown }).Notification
      delete (window as any).Notification
      expect(isPushSupported()).toBe(false)
      expect(getPushPermissionState()).toBe('unsupported')
      ;(window as any).Notification = original
    })
  })

  describe('isPushConfigured', () => {
    it('is false without the VAPID public key', () => {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      expect(isPushConfigured()).toBe(false)
    })

    it('is true with it', () => {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'key'
      expect(isPushConfigured()).toBe(true)
    })
  })

  describe('serializePushSubscription', () => {
    const withKeys = (keys: Record<string, ArrayBuffer | null>) => ({
      endpoint: 'https://example.com/push',
      getKey: (name: string) => keys[name] ?? null,
    }) as unknown as PushSubscription

    it('base64-encodes both keys', () => {
      const payload = serializePushSubscription(
        withKeys({ p256dh: new Uint8Array([104, 105]).buffer, auth: new Uint8Array([111, 107]).buffer })
      )

      expect(payload).toEqual({
        endpoint: 'https://example.com/push',
        p256dh: btoa('hi'),
        auth: btoa('ok'),
      })
    })

    it('refuses a subscription missing a key — the server cannot deliver to it', () => {
      const payload = serializePushSubscription(
        withKeys({ p256dh: new Uint8Array([104, 105]).buffer, auth: null })
      )

      expect(payload).toBeNull()
    })
  })

  describe('subscribeAndRegisterPush', () => {
    const callOrder: string[] = []
    let requestPermissionMock: jest.Mock
    let fetchMock: jest.Mock

    beforeEach(() => {
      callOrder.length = 0
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BCjD4h3jyoSIqEkl8yCpOQswsNjjJvi6YYNZss3VwCYoWhux3AeIWYuJUEdUVM0HWVDk6aD5aAT_ZnpC0V_Es-0'

      requestPermissionMock = jest.fn(async () => {
        callOrder.push('requestPermission')
        return 'granted'
      })
      // jsdom doesn't implement the Notification API at all; stub the pieces
      // isPushSupported()/subscribeAndRegisterPush() actually touch.
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        writable: true,
        value: { requestPermission: requestPermissionMock },
      })
      Object.defineProperty(window, 'PushManager', {
        configurable: true,
        writable: true,
        value: function PushManager() {},
      })

      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          get ready() {
            callOrder.push('serviceWorker.ready')
            return Promise.resolve({
              pushManager: {
                subscribe: jest.fn().mockResolvedValue({
                  endpoint: 'https://example.com/push',
                  getKey: (name: string) =>
                    name === 'p256dh' ? new Uint8Array([104, 105]).buffer : new Uint8Array([111, 107]).buffer,
                }),
              },
            })
          },
        },
      })

      fetchMock = jest.fn(async () => {
        callOrder.push('fetch')
        return { ok: true } as Response
      })
      global.fetch = fetchMock as unknown as typeof fetch
    })

    it('registers the subscription with the server and reports it', async () => {
      const result = await subscribeAndRegisterPush()

      expect(result).toBe('registered')
      expect(callOrder).toEqual(['requestPermission', 'serviceWorker.ready', 'fetch'])
      expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({
        endpoint: 'https://example.com/push',
        p256dh: btoa('hi'),
        auth: btoa('ok'),
      })
    })

    it('requests permission before waiting on service-worker readiness', async () => {
      // Awaiting serviceWorker.ready (or anything else) before
      // requestPermission() can burn through the browser's
      // transient-user-activation window from the triggering click, causing
      // the permission prompt to hang or silently no-op.
      await subscribeAndRegisterPush()

      expect(callOrder.indexOf('requestPermission')).toBeLessThan(callOrder.indexOf('serviceWorker.ready'))
    })

    it('never touches the service worker when permission is denied', async () => {
      requestPermissionMock.mockImplementation(async () => {
        callOrder.push('requestPermission')
        return 'denied'
      })

      const result = await subscribeAndRegisterPush()

      expect(result).toBe('denied')
      expect(callOrder).toEqual(['requestPermission'])
    })

    it('reports unavailable without requesting permission when the VAPID key is missing', async () => {
      // #983: the permission prompt used to be spent before this check, so the
      // user granted notifications and got no subscription and no feedback.
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

      const result = await subscribeAndRegisterPush()

      expect(result).toBe('unavailable')
      expect(callOrder).toEqual([])
    })

    it('reports unsupported before requesting permission when the browser lacks push', async () => {
      const original = (window as unknown as { PushManager?: unknown }).PushManager
      delete (window as any).PushManager

      const result = await subscribeAndRegisterPush()

      expect(result).toBe('unsupported')
      expect(callOrder).toEqual([])
      ;(window as any).PushManager = original
    })

    it('reports failed when the server refuses the subscription', async () => {
      fetchMock.mockImplementation(async () => {
        callOrder.push('fetch')
        return { ok: false } as Response
      })

      expect(await subscribeAndRegisterPush()).toBe('failed')
    })

    it('reports failed when the browser throws during subscribe', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          get ready() {
            return Promise.resolve({
              pushManager: {
                subscribe: jest.fn().mockRejectedValue(new Error('AbortError')),
              },
            })
          },
        },
      })

      expect(await subscribeAndRegisterPush()).toBe('failed')
    })
  })
})
