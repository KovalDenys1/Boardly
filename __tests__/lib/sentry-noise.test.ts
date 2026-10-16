import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ErrorEvent } from '@sentry/nextjs'
import { dropThirdPartyEvent } from '@/lib/sentry-noise'

function eventWithTopFrame(filename: string): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: 'Error',
          value: 'int64',
          stacktrace: { frames: [{ filename: 'app:///_next/static/chunks/main.js' }, { filename }] },
        },
      ],
    },
  }
}

describe('dropThirdPartyEvent', () => {
  it.each([
    'app:///pagead/js/r20261012/r20190131/rum.js',
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    'https://ep2.adtrafficquality.google/sodar/sodar2.js',
    'chrome-extension://abcdef/content.js',
  ])('drops an event thrown in %s', (filename) => {
    expect(dropThirdPartyEvent(eventWithTopFrame(filename))).toBeNull()
  })

  it('keeps an event thrown in our own chunk', () => {
    const event = eventWithTopFrame('app:///_next/static/chunks/app/games/page-1a2b.js')
    expect(dropThirdPartyEvent(event)).toBe(event)
  })

  it('keeps an event without a stack trace', () => {
    const event: ErrorEvent = { type: undefined, message: 'plain' }
    expect(dropThirdPartyEvent(event)).toBe(event)
  })
})

describe('security.txt', () => {
  const body = readFileSync(path.join(process.cwd(), 'public/.well-known/security.txt'), 'utf8')

  it('names the contact from SECURITY.md', () => {
    const policy = readFileSync(path.join(process.cwd(), 'SECURITY.md'), 'utf8')
    const contact = body.match(/^Contact: mailto:(\S+)$/m)?.[1]
    expect(contact).toBeTruthy()
    expect(policy).toContain(contact!)
  })

  it('has an Expires at least 30 days away, as RFC 9116 requires a live date', () => {
    const expires = Date.parse(body.match(/^Expires: (\S+)$/m)?.[1] ?? '')
    expect(expires - Date.now()).toBeGreaterThan(30 * 24 * 60 * 60 * 1000)
  })
})
