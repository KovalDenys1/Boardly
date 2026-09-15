/**
 * @jest-environment @edge-runtime/jest-environment
 */

/**
 * Guards #938. `/discord` is the only Discord address the site publishes – the footer and
 * the GitHub issue chooser both point here – so the two things that make it work are worth
 * pinning: the status is 302 (a cached 301 would outlive the next invite rotation), and an
 * unset env still reaches the server rather than dead-ending.
 */

import { GET } from '@/app/discord/route'
import { DEFAULT_DISCORD_INVITE_URL } from '@/lib/discord'

const ENV_KEY = 'NEXT_PUBLIC_DISCORD_INVITE'

describe('GET /discord', () => {
  const originalValue = process.env[ENV_KEY]

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = originalValue
    }
  })

  it('redirects to the bundled invite with a 302 when the env is unset', () => {
    delete process.env[ENV_KEY]

    const response = GET()

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(DEFAULT_DISCORD_INVITE_URL)
  })

  it('redirects to the configured invite when the env is set', () => {
    process.env[ENV_KEY] = 'https://discord.gg/rotated-invite'

    const response = GET()

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://discord.gg/rotated-invite')
  })

  it('falls back when the env is blank', () => {
    process.env[ENV_KEY] = '   '

    const response = GET()

    expect(response.headers.get('location')).toBe(DEFAULT_DISCORD_INVITE_URL)
  })
})
