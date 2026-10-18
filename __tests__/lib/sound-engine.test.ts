import { createSoundEngine, measureOnsetSeconds, type SoundEngine } from '@/lib/sound-engine'
import { cueSamples } from '@/lib/sound-map'
import { setSoundEnabled, setSoundVolume } from '@/lib/sound-settings'

class MockParam {
  value = 1
}

class MockNode {
  connect = jest.fn()
  disconnect = jest.fn()
}

class MockGain extends MockNode {
  gain = new MockParam()
}

class MockPanner extends MockNode {
  pan = new MockParam()
}

class MockSource extends MockNode {
  buffer: unknown = null
  playbackRate = new MockParam()
  onended: (() => void) | null = null
  start = jest.fn()
  stop = jest.fn()
}

function fakeBuffer(length = 4800, onsetAt = 0, sampleRate = 48000) {
  const data = new Float32Array(length)
  data.fill(0.5, onsetAt)
  return { numberOfChannels: 1, length, sampleRate, duration: length / sampleRate, getChannelData: () => data }
}

class MockAudioContext {
  static instances: MockAudioContext[] = []
  state: string = 'suspended'
  currentTime = 10
  sampleRate = 48000
  destination = new MockNode()
  sources: MockSource[] = []
  gains: MockGain[] = []
  constructor(public options?: AudioContextOptions) {
    MockAudioContext.instances.push(this)
  }
  createGain() {
    const gain = new MockGain()
    this.gains.push(gain)
    return gain
  }
  createStereoPanner() {
    return new MockPanner()
  }
  createBufferSource() {
    const source = new MockSource()
    this.sources.push(source)
    return source
  }
  createBuffer(_channels: number, length: number, rate: number) {
    return fakeBuffer(length, 0, rate)
  }
  decodeAudioData = jest.fn(async () => fakeBuffer())
  resume = jest.fn(async () => {
    this.state = 'running'
  })
  close = jest.fn(async () => {
    this.state = 'closed'
  })
}

class MockOfflineAudioContext {
  decodeAudioData = jest.fn(async () => fakeBuffer())
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let engine: SoundEngine
let now = 1000
let visibility: DocumentVisibilityState = 'visible'

function context(): MockAudioContext {
  return MockAudioContext.instances[MockAudioContext.instances.length - 1]
}

/** Sources made for cues, leaving out the silent buffer the unlock primes. */
function cueSources(): MockSource[] {
  return context().sources.slice(1)
}

async function readyEngine() {
  engine = createSoundEngine()
  await engine.preload(['ui.select', 'score.add', 'result.win', 'turn.mine'])
  window.dispatchEvent(new Event('pointerdown'))
  await flush()
  expect(context().state).toBe('running')
}

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})

beforeEach(() => {
  MockAudioContext.instances = []
  visibility = 'visible'
  now = 1000
  jest.spyOn(performance, 'now').mockImplementation(() => now)
  Object.assign(window, { AudioContext: MockAudioContext, OfflineAudioContext: MockOfflineAudioContext })
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch
  setSoundEnabled(true)
  setSoundVolume(0.7)
})

afterEach(() => {
  engine?.dispose()
  jest.restoreAllMocks()
})

describe('sound engine', () => {
  it('plays a decoded cue after a gesture, one source per layer, under a master at the user volume', async () => {
    await readyEngine()
    expect(context().options).toEqual({ latencyHint: 'interactive' })
    expect(context().gains[0].gain.value).toBeCloseTo(0.7)

    expect(engine.play('turn.mine')).toBe(true)

    const [first, second] = cueSources()
    expect(cueSources()).toHaveLength(2)
    expect(first.start).toHaveBeenCalledWith(10, 0)
    expect(second.start.mock.calls[0][0]).toBeCloseTo(10.09)
    expect(second.playbackRate.value).toBeCloseTo(2 ** (2 / 12))
  })

  it('plays nothing while muted or at volume 0', async () => {
    await readyEngine()

    setSoundEnabled(false)
    expect(engine.play('ui.select')).toBe(false)
    setSoundEnabled(true)
    setSoundVolume(0)
    expect(engine.play('ui.select')).toBe(false)

    expect(cueSources()).toHaveLength(0)
  })

  it('stops every live source, scheduled layers included, when sound is muted', async () => {
    await readyEngine()
    engine.play('result.win', { gameId: 'g1' })
    const live = cueSources()
    expect(live).toHaveLength(7)

    setSoundEnabled(false)

    for (const source of live) expect(source.stop).toHaveBeenCalled()
    expect(context().gains[0].gain.value).toBe(0)
  })

  it('plays nothing in a hidden tab and stops what was playing when the tab hides', async () => {
    await readyEngine()
    engine.play('turn.mine')
    const live = cueSources()

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    now += 5000

    for (const source of live) expect(source.stop).toHaveBeenCalled()
    expect(engine.play('turn.mine')).toBe(false)
    expect(cueSources()).toHaveLength(2)
  })

  it('drops a repeat inside the min gap instead of queueing it', async () => {
    await readyEngine()

    expect(engine.play('turn.mine')).toBe(true)
    now += 500
    expect(engine.play('turn.mine')).toBe(false)
    now += 400
    expect(engine.play('turn.mine')).toBe(true)

    expect(cueSources()).toHaveLength(4)
  })

  it('still plays with prefers-reduced-motion set', async () => {
    const original = window.matchMedia
    window.matchMedia = jest.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia
    await readyEngine()

    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
    expect(engine.play('ui.select')).toBe(true)
    expect(cueSources()).toHaveLength(1)
    window.matchMedia = original
  })

  it('plays a result cue once per game id', async () => {
    await readyEngine()

    expect(engine.play('result.win', { gameId: 'g1' })).toBe(true)
    now += 10_000
    expect(engine.play('result.win', { gameId: 'g1' })).toBe(false)
    expect(engine.play('result.win', { gameId: 'g2' })).toBe(true)
  })

  it('skips a cue whose samples are not decoded yet, and never plays it late', async () => {
    engine = createSoundEngine()
    window.dispatchEvent(new Event('pointerdown'))
    await flush()

    expect(engine.play('ui.select')).toBe(false)
    await engine.preload(['ui.select'])
    expect(cueSources()).toHaveLength(0)
    expect(engine.play('ui.select')).toBe(true)
  })

  it('fetches each sample once however many cues and calls ask for it', async () => {
    engine = createSoundEngine()
    await Promise.all([engine.preload(['score.add', 'guess.correct']), engine.preload(['score.add'])])

    const wanted = new Set([...cueSamples('score.add'), ...cueSamples('guess.correct')])
    expect(wanted.size).toBeLessThan(cueSamples('score.add').length + cueSamples('guess.correct').length)
    expect(global.fetch).toHaveBeenCalledTimes(wanted.size)
  })

  it('plays someone else’s action 4.5 dB under the viewer’s own, and leaves a cue with no remote level alone', async () => {
    await readyEngine()
    await engine.preload(['card.skip'])

    engine.play('card.skip')
    now += 100
    engine.play('card.skip', { remote: true })
    engine.play('turn.mine', { remote: true })

    const [own, remote, turn] = context().gains.slice(1).map((gain) => gain.gain.value)
    expect(20 * Math.log10(own)).toBeCloseTo(-11)
    expect(20 * Math.log10(remote / own)).toBeCloseTo(-4.5)
    expect(20 * Math.log10(turn)).toBeCloseTo(-9)
  })

  it('holds at most four voices of one cue and stops the oldest for a fifth', async () => {
    await readyEngine()

    for (let i = 0; i < 5; i += 1) {
      engine.play('ui.select')
      now += 50
    }

    const sources = cueSources()
    expect(sources).toHaveLength(5)
    expect(sources[0].stop).toHaveBeenCalled()
    for (const source of sources.slice(1)) expect(source.stop).not.toHaveBeenCalled()
  })

  it('asks for an ambient audio session where the browser has one', async () => {
    const audioSession = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: audioSession })
    await readyEngine()

    expect(audioSession.type).toBe('ambient')
    delete (navigator as Navigator & { audioSession?: unknown }).audioSession
  })

  it('does nothing, and throws nothing, where Web Audio is missing', async () => {
    Object.assign(window, { AudioContext: undefined, OfflineAudioContext: undefined })
    engine = createSoundEngine()

    await engine.preload(['ui.select'])
    window.dispatchEvent(new Event('pointerdown'))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(engine.play('ui.select')).toBe(false)
  })

  it('starts each buffer at its measured onset, 2 ms early', () => {
    const buffer = fakeBuffer(9600, 4800) as unknown as AudioBuffer
    expect(measureOnsetSeconds(buffer)).toBeCloseTo(0.098, 5)
    expect(measureOnsetSeconds(fakeBuffer(100, 0) as unknown as AudioBuffer)).toBe(0)
  })
})
