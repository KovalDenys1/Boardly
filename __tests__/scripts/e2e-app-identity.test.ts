import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DEFAULT_DEV_SERVER_PORT,
  IDENTITY_PATH,
  describeIdentityProblem,
  localBaseUrl,
  probeAppIdentity,
  readManifestIdentity,
  resolveBaseUrl,
  resolveDevServerPort,
} from '@/e2e/support/app-identity'

const BOARDLY_MANIFEST = JSON.stringify({
  name: 'Boardly - Multiplayer Board Games',
  short_name: 'Boardly',
})

function respondWith(status: number, body: string): typeof fetch {
  return (async () => ({ status, text: async () => body })) as unknown as typeof fetch
}

describe('e2e app identity guard (#900)', () => {
  describe('which server the suite talks to', () => {
    it('defaults to 3100 and takes E2E_PORT when it is set', () => {
      expect(resolveDevServerPort({})).toBe(DEFAULT_DEV_SERVER_PORT)
      expect(resolveDevServerPort({ E2E_PORT: '3111' })).toBe(3111)
      expect(resolveDevServerPort({ E2E_PORT: ' 3111 ' })).toBe(3111)
      expect(resolveDevServerPort({ E2E_PORT: '' })).toBe(DEFAULT_DEV_SERVER_PORT)
    })

    it('refuses an E2E_PORT that is not a port', () => {
      expect(() => resolveDevServerPort({ E2E_PORT: 'three thousand' })).toThrow('E2E_PORT')
      expect(() => resolveDevServerPort({ E2E_PORT: '0' })).toThrow('E2E_PORT')
      expect(() => resolveDevServerPort({ E2E_PORT: '70000' })).toThrow('E2E_PORT')
    })

    it('prefers an explicit E2E_BASE_URL over the dev server it would start', () => {
      expect(resolveBaseUrl({})).toBe(localBaseUrl(DEFAULT_DEV_SERVER_PORT))
      expect(resolveBaseUrl({ E2E_PORT: '3111' })).toBe('http://localhost:3111')
      expect(resolveBaseUrl({ E2E_BASE_URL: 'https://boardly.online', E2E_PORT: '3111' })).toBe(
        'https://boardly.online'
      )
    })
  })

  describe('reading the manifest', () => {
    it('accepts Boardly', () => {
      expect(readManifestIdentity(200, BOARDLY_MANIFEST)).toEqual({
        kind: 'boardly',
        name: 'Boardly - Multiplayer Board Games',
      })
      expect(readManifestIdentity(200, JSON.stringify({ short_name: 'Boardly' }))).toEqual({
        kind: 'boardly',
        name: 'Boardly',
      })
    })

    it('accepts the manifest this repo actually serves', () => {
      // A rename in public/manifest.json would otherwise lock the suite out of
      // its own dev server, and the message would blame the wrong thing.
      const served = readFileSync(join(process.cwd(), 'public', 'manifest.json'), 'utf8')
      expect(readManifestIdentity(200, served).kind).toBe('boardly')
    })

    it('rejects an app that names itself something else', () => {
      const identity = readManifestIdentity(200, JSON.stringify({ name: 'Some Other App' }))
      expect(identity.kind).toBe('foreign')
      expect(identity).toHaveProperty('detail', expect.stringContaining('Some Other App'))
    })

    it('rejects a neighbour that merely borrows the word', () => {
      // The control panel shares the database and the vocabulary, and is the
      // other thing that gets run on 3100 by hand.
      const identity = readManifestIdentity(
        200,
        JSON.stringify({ name: 'Boardly Control Panel', short_name: 'Boardly Admin' })
      )
      expect(identity.kind).toBe('foreign')
      expect(identity).toHaveProperty('detail', expect.stringContaining('Boardly Admin'))
    })

    it('rejects a server with no manifest at all', () => {
      // The shape of the #900 collision: another Next app on the same port.
      expect(readManifestIdentity(404, 'Not found').kind).toBe('foreign')
      expect(readManifestIdentity(200, '<!DOCTYPE html>').kind).toBe('foreign')
      expect(readManifestIdentity(200, '"a string"').kind).toBe('foreign')
      expect(readManifestIdentity(200, JSON.stringify({ icons: [] })).kind).toBe('foreign')
      expect(readManifestIdentity(200, JSON.stringify({ name: '   ' })).kind).toBe('foreign')
    })
  })

  describe('the refusal', () => {
    it('lets a Boardly server through', () => {
      expect(
        describeIdentityProblem({
          baseUrl: 'http://localhost:3100',
          identity: { kind: 'boardly', name: 'Boardly' },
          startsOwnServer: true,
        })
      ).toBeNull()
    })

    it('names the port and the way out when the suite started the server', () => {
      const reason = describeIdentityProblem({
        baseUrl: 'http://localhost:3100',
        identity: { kind: 'foreign', detail: `${IDENTITY_PATH} belongs to "Some Other App"` },
        startsOwnServer: true,
        port: 3100,
      })
      expect(reason).toContain('#900')
      expect(reason).toContain('is not Boardly')
      expect(reason).toContain('Some Other App')
      expect(reason).toContain('lsof -ti:3100')
      expect(reason).toContain('E2E_PORT')
    })

    it('points at E2E_BASE_URL instead when a deployment was named', () => {
      const reason = describeIdentityProblem({
        baseUrl: 'https://example.com',
        identity: { kind: 'foreign', detail: `GET ${IDENTITY_PATH} answered 404` },
        startsOwnServer: false,
      })
      expect(reason).toContain('E2E_BASE_URL')
      expect(reason).not.toContain('lsof')
    })

    it('refuses a base URL that answers nothing', () => {
      const reason = describeIdentityProblem({
        baseUrl: 'http://localhost:3100',
        identity: { kind: 'unreachable', detail: 'fetch failed' },
        startsOwnServer: true,
      })
      expect(reason).toContain('nothing answered')
      expect(reason).toContain('fetch failed')
    })
  })

  describe('the probe', () => {
    it('asks the base URL for its manifest', async () => {
      const seen: string[] = []
      const fetcher = (async (url: string) => {
        seen.push(String(url))
        return { status: 200, text: async () => BOARDLY_MANIFEST }
      }) as unknown as typeof fetch

      await expect(probeAppIdentity('http://localhost:3100', fetcher)).resolves.toEqual({
        kind: 'boardly',
        name: 'Boardly - Multiplayer Board Games',
      })
      expect(seen).toEqual([`http://localhost:3100${IDENTITY_PATH}`])
    })

    it('reports a foreign app rather than throwing', async () => {
      const identity = await probeAppIdentity(
        'http://localhost:3100',
        respondWith(404, 'This page could not be found')
      )
      expect(identity.kind).toBe('foreign')
      expect(identity).toHaveProperty('detail', expect.stringContaining('404'))
    })

    it('turns a connection failure into unreachable, not a crash', async () => {
      const fetcher = (async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:3100')
      }) as unknown as typeof fetch

      const identity = await probeAppIdentity('http://localhost:3100', fetcher)
      expect(identity).toEqual({ kind: 'unreachable', detail: 'connect ECONNREFUSED 127.0.0.1:3100' })
    })
  })
})
