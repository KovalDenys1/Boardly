/**
 * @jest-environment node
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { postBotTurn } from '@/lib/bot-turn-trigger'

interface Seen {
  path: string | undefined
  method: string | undefined
  secret: string | string[] | undefined
  body: string
}

let server: http.Server
let port: number
let seen: Seen[]
let redirectTo: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      seen.push({ path: req.url, method: req.method, secret: req.headers['x-internal-secret'], body })
      if (req.url?.startsWith('/redirecting/')) {
        res.writeHead(301, { location: redirectTo })
        res.end()
        return
      }
      res.writeHead(req.method === 'POST' ? 200 : 405, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ method: req.method }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  seen = []
  redirectTo = '/api/game/g1/bot-turn'
})

function call(url: string) {
  return postBotTurn(url, {
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 's3cret' },
    body: JSON.stringify({ botUserId: 'bot-1' }),
  })
}

describe('postBotTurn', () => {
  it('keeps the POST, its body and its secret across a 301, which fetch alone turns into a GET', async () => {
    const plain = await fetch(`http://127.0.0.1:${port}/redirecting/api/game/g1/bot-turn`, { method: 'POST', body: '{}' })
    expect(plain.status).toBe(405)
    seen = []

    const response = await call(`http://127.0.0.1:${port}/redirecting/api/game/g1/bot-turn`)

    expect(response.status).toBe(200)
    expect(seen.map((s) => s.method)).toEqual(['POST', 'POST'])
    expect(seen[1]).toMatchObject({ path: '/api/game/g1/bot-turn', secret: 's3cret', body: '{"botUserId":"bot-1"}' })
  })

  it('does not follow a redirect to another host, so the secret stays home', async () => {
    redirectTo = `http://localhost:${port}/api/game/g1/bot-turn`

    const response = await call(`http://127.0.0.1:${port}/redirecting/api/game/g1/bot-turn`)

    expect(response.status).toBe(301)
    expect(seen).toHaveLength(1)
  })

  it('posts straight through when there is no redirect', async () => {
    const response = await call(`http://127.0.0.1:${port}/api/game/g1/bot-turn`)

    expect(response.status).toBe(200)
    expect(seen.map((s) => s.method)).toEqual(['POST'])
  })
})
