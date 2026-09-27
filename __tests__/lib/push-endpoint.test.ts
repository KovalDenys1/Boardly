/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { isAllowedPushEndpoint, PUSH_ENDPOINT_LIMITS } from '@/lib/push-endpoint'

describe('isAllowedPushEndpoint', () => {
  it('allows the real push service hosts', () => {
    const allowed = [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://android.googleapis.com/gcm/send/abc123',
      'https://updates.push.services.mozilla.com/wpush/v2/abc123',
      'https://web.push.apple.com/QAB...',
      'https://xyz.push.apple.com/something',
      'https://xyz.notify.windows.com/?token=abc',
      'https://xyz.push.samsungosp.com/push/abc',
    ]

    for (const endpoint of allowed) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true)
    }
  })

  // #1117 (audit S2-02): the whole point — an arbitrary host or a lookalike domain must
  // never pass through to `webpush.sendNotification`.
  it('refuses a private-network IP', () => {
    expect(isAllowedPushEndpoint('https://10.0.0.1:8443/x')).toBe(false)
  })

  it('refuses an arbitrary https host', () => {
    expect(isAllowedPushEndpoint('https://example.com/')).toBe(false)
  })

  it('refuses a lookalike domain (suffix match must not be a substring match)', () => {
    expect(isAllowedPushEndpoint('https://evil-fcm.googleapis.com.attacker.example/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.example/x')).toBe(false)
  })

  it('refuses a non-default port even on an allowed host', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc123')).toBe(false)
  })

  it('refuses http, even on an allowed host', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc123')).toBe(false)
  })

  it('refuses a malformed URL without throwing', () => {
    expect(isAllowedPushEndpoint('not-a-url')).toBe(false)
  })

  it('refuses an endpoint longer than the length cap', () => {
    const longEndpoint = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(PUSH_ENDPOINT_LIMITS.endpoint)}`
    expect(isAllowedPushEndpoint(longEndpoint)).toBe(false)
  })
})
