/**
 * @jest-environment node
 */

/**
 * Sketch & Guess live strokes travel peer to peer, so the frame itself has to
 * prove who drew it. The server certifies the drawer's own key for one round of
 * one game on one topic; every stroke is signed with that key. These tests run
 * the real sender, the real server sealing and the real receiver, with the
 * relay's JSON round trip in between, and try each way a non-drawer could get a
 * stroke onto a guesser's canvas.
 */

import { webcrypto } from 'crypto'
import {
  __resetRealtimeVerifierForTests,
} from '@/lib/client/realtime-verify'
import { createSketchLiveReceiver, createSketchLiveSender } from '@/lib/client/sketch-live-signing'
import { SKETCH_LIVE_KEY_EVENT, SKETCH_LIVE_MAX_FRAME_AGE_MS, SKETCH_LIVE_RESYNC_MS, sketchLiveSigningInput, type SketchLiveMessage } from '@/lib/sketch-live'
import { installSignedRealtime, signBroadcast } from '@/__tests__/fixtures/signed-realtime'

installSignedRealtime()

const TOPIC = 'lobby:1234:test-realtime-secret'
const GAME = 'game-1'
const DRAWER = 'user-drawer'
const GUESSER = 'user-guesser'
const stroke = { color: '#E4572E', width: 3, points: [{ x: 1.5, y: 2 }, { x: 3, y: 4.25 }] }
const expected = { gameId: GAME, round: 2, drawerId: DRAWER }

/** What the relay does: parse, re-encode, and with it lose key order. */
function relay<T>(value: T): T {
  const reorder = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(reorder)
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).reverse().map(([k, v]) => [k, reorder(v)]))
    }
    return input
  }
  return reorder(JSON.parse(JSON.stringify(value))) as T
}

/** The server's certificate for a key, as POST /api/game/[gameId]/sketch-live-key issues it. */
function certify(claims: { gameId?: string; round?: number; drawerId?: string; topic?: string }) {
  return (gameId: string, key: { x: string; y: string }) =>
    Promise.resolve(
      signBroadcast(claims.topic ?? TOPIC, SKETCH_LIVE_KEY_EVENT, {
        gameId: claims.gameId ?? gameId,
        round: claims.round ?? 2,
        drawerId: claims.drawerId ?? DRAWER,
        x: key.x,
        y: key.y,
      })
    )
}

/** A sender whose frames are collected; `next()` waits for the next one. */
function senderWith(requestCert: ReturnType<typeof certify>) {
  const frames: unknown[] = []
  const waiting: Array<(frame: unknown) => void> = []
  const sender = createSketchLiveSender({
    requestCert,
    emit: (frame) => {
      const copy = relay(frame)
      frames.push(copy)
      waiting.shift()?.(copy)
    },
  })
  const next = () => new Promise<Record<string, unknown>>((resolve) => waiting.push(resolve as (frame: unknown) => void))
  return { sender, frames, next }
}

function strokes(round = 2, drawerId = DRAWER): SketchLiveMessage {
  return { kind: 'strokes', round, drawerId, strokes: [stroke] }
}

/** A clock the test moves by hand, so a certificate issued later is newer. */
function manualClock() {
  let now = Date.now()
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  return (ms: number) => {
    now += ms
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

/**
 * The drawer draws on page A, then on page B, which is certified later; A has
 * heard B's frame. Every frame so far reached `receiver`.
 */
async function drawnOnTwoPages(receiver: ReturnType<typeof createSketchLiveReceiver>) {
  const advance = manualClock()
  const requestedByA: string[] = []
  const a = senderWith((gameId, key) => {
    requestedByA.push(gameId)
    return certify({})(gameId, key)
  })
  const firstFromA = a.next()
  a.sender.send(GAME, strokes())
  const fromA = await firstFromA
  expect(await receiver.open(TOPIC, fromA, expected)).not.toBeNull()

  advance(1_000)
  const b = senderWith(certify({}))
  const firstFromB = b.next()
  b.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke] })
  const fromB = await firstFromB
  expect(await receiver.open(TOPIC, fromB, expected)).not.toBeNull()
  await a.sender.hear(TOPIC, fromB)
  return { advance, a, fromA, fromB, requestedByA }
}

async function signPayload(privateKey: CryptoKey, text: string): Promise<string> {
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(text))
  return Buffer.from(signature).toString('base64url')
}

beforeEach(() => {
  __resetRealtimeVerifierForTests()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('Sketch & Guess live strokes', () => {
  it("delivers the drawer's strokes and the stroke in progress", async () => {
    const { sender, next } = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()

    const firstFrame = next()
    sender.send(GAME, strokes())
    expect(await receiver.open(TOPIC, await firstFrame, expected)).toEqual(strokes())

    const secondFrame = next()
    sender.send(GAME, { kind: 'live', round: 2, drawerId: DRAWER, live: stroke })
    expect(await receiver.open(TOPIC, await secondFrame, expected))
      .toEqual({ kind: 'live', round: 2, drawerId: DRAWER, live: stroke })
  })

  it('delivers frames heard back to back in the order they came, whichever check finishes first', async () => {
    const { sender, next } = senderWith(certify({}))
    const first = next()
    sender.send(GAME, strokes())
    const finished = await first
    const second = next()
    sender.send(GAME, { kind: 'live', round: 2, drawerId: DRAWER, live: stroke })
    const inProgress = await second

    const subtle = globalThis.crypto.subtle
    const verify = subtle.verify.bind(subtle)
    jest.spyOn(subtle, 'verify').mockImplementation(async (...args: Parameters<SubtleCrypto['verify']>) => {
      const text = new TextDecoder().decode(args[3] as ArrayBuffer)
      if (text.includes('"strokes"')) await new Promise((resolve) => setTimeout(resolve, 30))
      return verify(...args)
    })

    const receiver = createSketchLiveReceiver()
    const opened = await Promise.all([receiver.open(TOPIC, finished, expected), receiver.open(TOPIC, inProgress, expected)])
    expect(opened).toEqual([strokes(), { kind: 'live', round: 2, drawerId: DRAWER, live: stroke }])
  })

  it("drops another player's stroke that only names the drawer, as every stroke used to", async () => {
    const receiver = createSketchLiveReceiver()
    expect(await receiver.open(TOPIC, strokes(), expected)).toBeNull()
  })

  it("drops another player's stroke signed with their own key under the drawer's certificate", async () => {
    const { sender, next } = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()
    const genuine = next()
    sender.send(GAME, strokes())
    const frame = await genuine
    const cert = frame.cert as { sig: string }

    const forger = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    const word: SketchLiveMessage = { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [{ ...stroke, color: '#000000' }] }
    const seq = (frame.seq as number) + 1
    const t = frame.t as number
    const forged = { ...frame, seq, p: word, sig: await signPayload(forger.privateKey, sketchLiveSigningInput(cert.sig, seq, t, word)) }
    expect(await receiver.open(TOPIC, forged, expected)).toBeNull()

    // Nor does the drawer's genuine signature carry over to another drawing.
    expect(await receiver.open(TOPIC, { ...frame, seq: seq + 1, p: word }, expected)).toBeNull()
  })

  it("drops a spectator's stroke under a certificate the server never signed", async () => {
    const spectator = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const jwk = await webcrypto.subtle.exportKey('jwk', spectator.publicKey)
    // A genuine certificate for somebody's key, with the spectator's key written over it.
    const sealed = signBroadcast(TOPIC, SKETCH_LIVE_KEY_EVENT, { gameId: GAME, round: 2, drawerId: DRAWER, x: 'x', y: 'y' }) as { sig: string }
    const cert = { ...sealed, p: { gameId: GAME, round: 2, drawerId: DRAWER, x: jwk.x, y: jwk.y } }

    const message = strokes()
    const t = Date.now()
    const frame = { cert, seq: 1, t, p: message, sig: await signPayload(spectator.privateKey, sketchLiveSigningInput(cert.sig, 1, t, message)) }
    expect(await createSketchLiveReceiver().open(TOPIC, relay(frame), expected)).toBeNull()
  })

  it('drops a stroke from a player who has guessed, even with a genuine certificate from a round they drew', async () => {
    const { sender, next } = senderWith(certify({ round: 1, drawerId: GUESSER }))
    const receiver = createSketchLiveReceiver()
    const frame = next()
    sender.send(GAME, strokes(1, GUESSER))
    const earlierRound = await frame

    // Round 2 is DRAWER's; the guesser re-labels the round-1 frame's message.
    expect(await receiver.open(TOPIC, earlierRound, expected)).toBeNull()
    expect(await receiver.open(TOPIC, { ...earlierRound, p: strokes(2, DRAWER) }, expected)).toBeNull()
  })

  it('drops a certificate issued for another lobby topic or another game', async () => {
    const receiver = createSketchLiveReceiver()

    const otherTopic = senderWith(certify({ topic: 'lobby:9999:other-secret' }))
    const first = otherTopic.next()
    otherTopic.sender.send(GAME, strokes())
    expect(await receiver.open(TOPIC, await first, expected)).toBeNull()

    // The same lobby's previous game: same topic, same drawer, same round number.
    const otherGame = senderWith(certify({}))
    const second = otherGame.next()
    otherGame.sender.send('game-0', strokes())
    expect(await receiver.open(TOPIC, await second, expected)).toBeNull()
  })

  it("drops a replay of the drawer's own earlier frame", async () => {
    const { sender, next } = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()

    const first = next()
    sender.send(GAME, strokes())
    const older = await first
    const second = next()
    sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke] })
    const newer = await second

    expect(await receiver.open(TOPIC, newer, expected)).not.toBeNull()
    expect(await receiver.open(TOPIC, older, expected)).toBeNull()
    expect(await receiver.open(TOPIC, newer, expected)).toBeNull()
  })

  it("drops the drawer's earlier frame replayed under a copy of its certificate with an extra key", async () => {
    const { sender, next } = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()
    const first = next()
    sender.send(GAME, strokes())
    const older = await first
    const second = next()
    sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [] })
    expect(await receiver.open(TOPIC, older, expected)).not.toBeNull()
    expect(await receiver.open(TOPIC, await second, expected)).not.toBeNull()

    const altered = { ...older, cert: { ...(older.cert as Record<string, unknown>), junk: 1 } }
    expect(await receiver.open(TOPIC, altered, expected)).toBeNull()
  })

  it('drops a byte-identical replay after seventy altered copies of the certificate', async () => {
    const { sender, next } = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()
    const first = next()
    sender.send(GAME, strokes())
    const older = await first
    const second = next()
    sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [] })
    const newer = await second
    expect(await receiver.open(TOPIC, older, expected)).not.toBeNull()
    expect(await receiver.open(TOPIC, newer, expected)).not.toBeNull()

    const variants: unknown[] = []
    for (let junk = 0; junk < 70; junk += 1) {
      variants.push(await receiver.open(TOPIC, { ...older, cert: { ...(older.cert as Record<string, unknown>), junk } }, expected))
    }
    expect(await receiver.open(TOPIC, older, expected)).toBeNull()
    expect(variants.every((opened) => opened === null)).toBe(true)
  })

  it("paints the drawer's next frame after a flood of altered certificates", async () => {
    const { sender, next } = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()
    const first = next()
    sender.send(GAME, strokes())
    const genuine = await first
    expect(await receiver.open(TOPIC, genuine, expected)).not.toBeNull()
    for (let junk = 0; junk < 70; junk += 1) {
      await receiver.open(TOPIC, { ...genuine, cert: { ...(genuine.cert as Record<string, unknown>), junk } }, expected)
    }

    const later = next()
    const cleared: SketchLiveMessage = { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [] }
    sender.send(GAME, cleared)
    expect(await receiver.open(TOPIC, await later, expected)).toEqual(cleared)
  })

  it('drops a frame that carries a key outside the frame format', async () => {
    const { sender, next } = senderWith(certify({}))
    const first = next()
    sender.send(GAME, strokes())
    expect(await createSketchLiveReceiver().open(TOPIC, { ...(await first), junk: 1 }, expected)).toBeNull()
  })

  it("drops the drawer's own frame replayed to a page that opened after it was sent", async () => {
    const { sender, next } = senderWith(certify({}))
    const first = next()
    sender.send(GAME, strokes())
    const recorded = await first
    const sentAt = Date.now()

    jest.spyOn(Date, 'now').mockReturnValue(sentAt + 2_000)
    expect(await createSketchLiveReceiver().open(TOPIC, recorded, expected)).not.toBeNull()

    jest.spyOn(Date, 'now').mockReturnValue(sentAt + SKETCH_LIVE_MAX_FRAME_AGE_MS + 1_000)
    expect(await createSketchLiveReceiver().open(TOPIC, recorded, expected)).toBeNull()
  })

  it("drops the frames of the drawer's page once a newer certificate for the round has been seen", async () => {
    const before = senderWith(certify({}))
    const oldFrames = [before.next(), before.next()]
    before.sender.send(GAME, strokes())
    const firstOld = await oldFrames[0]
    before.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke] })
    const secondOld = await oldFrames[1]

    // The drawer reloads: a new page, a new key, a newer certificate for the same round.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1_000)
    const after = senderWith(certify({}))
    const newFrame = after.next()
    after.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke, stroke] })

    const receiver = createSketchLiveReceiver()
    expect(await receiver.open(TOPIC, firstOld, expected)).not.toBeNull()
    expect(await receiver.open(TOPIC, await newFrame, expected)).not.toBeNull()
    expect(await receiver.open(TOPIC, secondOld, expected)).toBeNull()
  })

  it("keeps the drawer's frame when a forged copy of its certificate arrives first", async () => {
    const { sender, next } = senderWith(certify({}))
    const frame = next()
    sender.send(GAME, strokes())
    const genuine = await frame
    const cert = genuine.cert as Record<string, unknown>
    const forged = { ...genuine, cert: { ...cert, p: { ...(cert.p as Record<string, unknown>), round: 3 } } }

    const receiver = createSketchLiveReceiver()
    const [fromForged, fromDrawer] = await Promise.all([
      receiver.open(TOPIC, forged, expected),
      receiver.open(TOPIC, genuine, expected),
    ])
    expect(fromForged).toBeNull()
    expect(fromDrawer).toEqual(strokes())
  })

  it("sends nothing from a drawer's second page nobody draws on, so the page drawn on keeps painting", async () => {
    const advance = manualClock()
    const drawing = senderWith(certify({}))
    const receiver = createSketchLiveReceiver()
    const first = drawing.next()
    drawing.sender.send(GAME, strokes())
    expect(await receiver.open(TOPIC, await first, expected)).not.toBeNull()

    // Opened later, so its certificate is the newer one; its timer re-sends the empty canvas.
    advance(1_000)
    const idle = senderWith(certify({}))
    idle.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [] })
    await settle()
    advance(SKETCH_LIVE_RESYNC_MS)
    idle.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [] })
    await settle()
    expect(idle.frames).toHaveLength(0)

    const later = drawing.next()
    const drawn: SketchLiveMessage = { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke] }
    drawing.sender.send(GAME, drawn)
    expect(await receiver.open(TOPIC, await later, expected)).toEqual(drawn)
  })

  it("paints the page the drawer draws on again after another of the drawer's pages took the round under a newer certificate", async () => {
    const receiver = createSketchLiveReceiver()
    const { advance, a } = await drawnOnTwoPages(receiver)

    advance(SKETCH_LIVE_RESYNC_MS)
    const back = a.next()
    const drawn: SketchLiveMessage = { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke, stroke] }
    a.sender.send(GAME, drawn)
    expect(await receiver.open(TOPIC, await back, expected)).toEqual(drawn)
  })

  it("drops the drawer's frames under older certificates once the page drawn on has taken the round back", async () => {
    const receiver = createSketchLiveReceiver()
    const { advance, a, fromA, fromB } = await drawnOnTwoPages(receiver)
    advance(SKETCH_LIVE_RESYNC_MS)
    const back = a.next()
    a.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke, stroke] })
    expect(await receiver.open(TOPIC, await back, expected)).not.toBeNull()

    expect(await receiver.open(TOPIC, fromA, expected)).toBeNull()
    expect(await receiver.open(TOPIC, fromB, expected)).toBeNull()
  })

  it("keeps a page that another of the drawer's pages took the round from quiet: its re-sends send and ask for nothing", async () => {
    const { advance, a, requestedByA } = await drawnOnTwoPages(createSketchLiveReceiver())

    advance(SKETCH_LIVE_RESYNC_MS)
    a.sender.send(GAME, strokes())
    await settle()
    expect(a.frames).toHaveLength(1)
    expect(requestedByA).toHaveLength(1)
  })

  it('keeps streaming after hearing a forged certificate that claims to be newer', async () => {
    const advance = manualClock()
    const { sender, next } = senderWith(certify({}))
    const first = next()
    sender.send(GAME, strokes())
    const genuine = await first
    const cert = genuine.cert as Record<string, unknown>

    advance(1_000)
    await sender.hear(TOPIC, { ...genuine, seq: (genuine.seq as number) + 1, cert: { ...cert, iat: (cert.iat as number) + 60_000 } })
    const resent = next()
    sender.send(GAME, strokes())
    expect(await createSketchLiveReceiver().open(TOPIC, await resent, expected)).toEqual(strokes())
  })

  it('takes the round back on the next stroke after a page that may have missed the takeover is told so', async () => {
    const advance = manualClock()
    const receiver = createSketchLiveReceiver()
    const a = senderWith(certify({}))
    const fromA = a.next()
    a.sender.send(GAME, strokes())
    expect(await receiver.open(TOPIC, await fromA, expected)).not.toBeNull()

    // Page B takes the round while A is hidden, so A never hears it.
    advance(1_000)
    const b = senderWith(certify({}))
    const fromB = b.next()
    b.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke] })
    expect(await receiver.open(TOPIC, await fromB, expected)).not.toBeNull()

    a.sender.renewOnNextStroke()
    advance(SKETCH_LIVE_RESYNC_MS)
    const back = a.next()
    const drawn: SketchLiveMessage = { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke, stroke] }
    a.sender.send(GAME, drawn)
    expect(await receiver.open(TOPIC, await back, expected)).toEqual(drawn)
  })

  it("goes quiet when its own certificate arrives older than one of the drawer's other pages heard while it was requested", async () => {
    const advance = manualClock()
    let asked: () => void = () => {}
    const askedFor = new Promise<void>((resolve) => {
      asked = resolve
    })
    let release: () => void = () => {}
    const a = senderWith((gameId, key) => {
      const sealedNow = certify({})(gameId, key)
      asked()
      return new Promise((resolve) => {
        release = () => resolve(sealedNow)
      })
    })
    a.sender.send(GAME, strokes())
    await askedFor

    advance(1_000)
    const b = senderWith(certify({}))
    const fromB = b.next()
    b.sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [stroke, stroke] })
    await a.sender.hear(TOPIC, await fromB)

    release()
    await settle()
    expect(a.frames).toHaveLength(0)
  })

  it("spends no signature check on frames that do not claim a newer certificate than the page's own", async () => {
    const { sender, next } = senderWith(certify({}))
    const first = next()
    sender.send(GAME, strokes())
    const own = await first
    const cert = own.cert as Record<string, unknown>

    const verify = jest.spyOn(globalThis.crypto.subtle, 'verify')
    for (let junk = 1; junk <= 40; junk += 1) {
      await sender.hear(TOPIC, { ...own, seq: (own.seq as number) + junk })
      await sender.hear(TOPIC, { ...own, cert: { ...cert, iat: (cert.iat as number) - junk } })
    }
    expect(verify).not.toHaveBeenCalled()
  })

  it('drops a frame whose certificate is nested too deep to serialise', async () => {
    const { sender, next } = senderWith(certify({}))
    const first = next()
    sender.send(GAME, strokes())
    const frame = await first
    const cert = frame.cert as { p: Record<string, unknown> }
    let deep: Record<string, unknown> = {}
    for (let depth = 0; depth < 100_000; depth += 1) deep = { deep }

    await expect(createSketchLiveReceiver().open(TOPIC, { ...frame, cert: { ...cert, p: { ...cert.p, deep } } }, expected)).resolves.toBeNull()
  })

  it('sends nothing until the server has certified the key, then the newest finished strokes', async () => {
    let release: (cert: unknown) => void = () => {}
    const requested: string[] = []
    const { sender, frames, next } = senderWith((gameId, key) => {
      requested.push(gameId)
      return new Promise((resolve) => {
        release = () => resolve(certify({})(gameId, key))
      })
    })

    const arrived = next()
    sender.send(GAME, { kind: 'strokes', round: 2, drawerId: DRAWER, strokes: [] })
    sender.send(GAME, { kind: 'live', round: 2, drawerId: DRAWER, live: stroke })
    sender.send(GAME, strokes())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(frames).toHaveLength(0)
    expect(requested).toEqual([GAME])

    release(null)
    const frame = await arrived
    expect(await createSketchLiveReceiver().open(TOPIC, frame, expected)).toEqual(strokes())
    expect(frames).toHaveLength(1)
  })
})
