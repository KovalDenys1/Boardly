/**
 * @jest-environment node
 */
/**
 * #1142: an OAuth address is marked verified only when the provider vouches for it.
 * What each provider sends: Google the ID token claim `email_verified`, Discord the user
 * field `verified`, GitHub nothing on /user and `verified` per address on /user/emails.
 */
import GoogleProvider from 'next-auth/providers/google'
import DiscordProvider from 'next-auth/providers/discord'
import GitHubProvider from 'next-auth/providers/github'
import {
  githubEmailVerified,
  providerAssertsEmailVerified,
  providerVerifiesAccountEmail,
  readProviderEmailVerified,
  withGitHubEmailVerification,
  withProviderEmailVerified,
} from '@/lib/oauth-email-verification'

const credentials = { clientId: 'id', clientSecret: 'secret' }
const tokens = { access_token: 'gho_test' } as never

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

describe('providerAssertsEmailVerified', () => {
  it('reads each provider its own way', () => {
    expect(providerAssertsEmailVerified('google', { email_verified: true })).toBe(true)
    expect(providerAssertsEmailVerified('google', { email_verified: 'true' })).toBe(true)
    expect(providerAssertsEmailVerified('google', { email_verified: false })).toBe(false)
    expect(providerAssertsEmailVerified('discord', { verified: true })).toBe(true)
    expect(providerAssertsEmailVerified('discord', { verified: false })).toBe(false)
    expect(providerAssertsEmailVerified('github', { email_verified: true })).toBe(true)
  })

  it('treats a missing flag, an unknown provider or no profile as not verified', () => {
    expect(providerAssertsEmailVerified('discord', { email: 'a@example.com' })).toBe(false)
    expect(providerAssertsEmailVerified('github', {})).toBe(false)
    // Google's field is not Discord's and the other way round.
    expect(providerAssertsEmailVerified('discord', { email_verified: true })).toBe(false)
    expect(providerAssertsEmailVerified('google', { verified: true })).toBe(false)
    expect(providerAssertsEmailVerified('twitter', { verified: true })).toBe(false)
    expect(providerAssertsEmailVerified('google', undefined)).toBe(false)
  })
})

describe('providerVerifiesAccountEmail', () => {
  it('needs the provider to vouch and the address to be the account’s own', () => {
    expect(providerVerifiesAccountEmail({ providerVerified: true, providerEmail: 'A@Example.com', accountEmail: 'a@example.com' })).toBe(true)
    expect(providerVerifiesAccountEmail({ providerVerified: false, providerEmail: 'a@example.com', accountEmail: 'a@example.com' })).toBe(false)
    expect(providerVerifiesAccountEmail({ providerVerified: true, providerEmail: 'other@example.com', accountEmail: 'a@example.com' })).toBe(false)
    expect(providerVerifiesAccountEmail({ providerVerified: true, providerEmail: null, accountEmail: null })).toBe(false)
  })
})

describe('withProviderEmailVerified keeps the default profile and adds the flag', () => {
  it('Google', async () => {
    const profile = withProviderEmailVerified('google', GoogleProvider(credentials).profile)
    const user = await profile(
      { sub: 'g-1', name: 'Jane Doe', email: 'jane@example.com', picture: 'p', email_verified: true } as never,
      tokens
    )
    expect(user).toEqual({ id: 'g-1', name: 'Jane Doe', email: 'jane@example.com', image: 'p', providerEmailVerified: true })
    expect(readProviderEmailVerified(user)).toBe(true)
  })

  it('Discord, unverified', async () => {
    const profile = withProviderEmailVerified('discord', DiscordProvider(credentials).profile)
    const user = await profile(
      { id: 'd-1', username: 'jane', email: 'jane@example.com', avatar: null, discriminator: '0', verified: false } as never,
      tokens
    )
    expect(user).toEqual(expect.objectContaining({ id: 'd-1', name: 'jane', email: 'jane@example.com', providerEmailVerified: false }))
    expect(readProviderEmailVerified(user)).toBe(false)
  })
})

describe('GitHub', () => {
  it('githubEmailVerified asks /user/emails about the address GitHub returned', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse([
        { email: 'jane@example.com', primary: true, verified: true, visibility: 'public' },
        { email: 'old@example.com', primary: false, verified: false, visibility: null },
      ])
    )
    await expect(githubEmailVerified('gho_test', 'Jane@Example.com', fetchImpl as never)).resolves.toBe(true)
    await expect(githubEmailVerified('gho_test', 'old@example.com', fetchImpl as never)).resolves.toBe(false)
    await expect(githubEmailVerified('gho_test', 'stranger@example.com', fetchImpl as never)).resolves.toBe(false)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/user/emails',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'token gho_test' }) })
    )
  })

  it('githubEmailVerified answers false when GitHub cannot be asked', async () => {
    await expect(githubEmailVerified('gho_test', 'jane@example.com', (async () => jsonResponse({}, false)) as never)).resolves.toBe(false)
    await expect(githubEmailVerified('gho_test', 'jane@example.com', (async () => { throw new Error('offline') }) as never)).resolves.toBe(false)
    await expect(githubEmailVerified(undefined, 'jane@example.com')).resolves.toBe(false)
  })

  it('the userinfo wrapper keeps the default request and adds email_verified', async () => {
    const defaultRequest = jest.fn(async () => ({ id: 7, login: 'jane', email: 'jane@example.com' }))
    const fetchImpl = jest.fn(async () => jsonResponse([{ email: 'jane@example.com', verified: true }]))
    const handler = withGitHubEmailVerification({ url: 'https://api.github.com/user', request: defaultRequest }, fetchImpl as never)

    const context = { tokens, client: {}, provider: {} } as never
    const profile = await handler.request!(context)

    expect(defaultRequest).toHaveBeenCalledWith(context)
    expect(handler.url).toBe('https://api.github.com/user')
    expect(profile).toEqual({ id: 7, login: 'jane', email: 'jane@example.com', email_verified: true })
    expect(providerAssertsEmailVerified('github', profile)).toBe(true)
  })

  it('wraps the real provider default, which has a userinfo request', () => {
    const defaults = GitHubProvider(credentials)
    const handler = withGitHubEmailVerification(defaults.userinfo)
    expect(typeof handler.request).toBe('function')
    expect(handler.url).toBe('https://api.github.com/user')
  })
})
