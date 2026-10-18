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

type ResumeMode = 'immediate' | 'deferred' | 'never'

class MockAudioContext {
  static instances: MockAudioContext[] = []
  static sampleRate = 48000
  static resumeMode: ResumeMode = 'immediate'
  state: string = 'suspended'
  currentTime = 10
  sampleRate = MockAudioContext.sampleRate
  destination = new MockNode()
  sources: MockSource[] = []
  gains: MockGain[] = []
  finishResume: () => void = () => {}
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
  decodeAudioData = jest.fn(async () => fakeBuffer(4800, 0, this.sampleRate))
  resume = jest.fn(() => {
    if (MockAudioContext.resumeMode === 'never') return new Promise<void>(() => {})
    if (MockAudioContext.resumeMode === 'deferred') {
      return new Promise<void>((resolve) => {
        this.finishResume = () => {
          this.state = 'running'
          resolve()
        }
      })
    }
    this.state = 'running'
    return Promise.resolve()
  })
  suspend = jest.fn(async () => {
    this.state = 'suspended'
  })
  close = jest.fn(async () => {
    this.state = 'closed'
  })
}

class MockOfflineAudioContext {
  static instances: MockOfflineAudioContext[] = []
  args: number[]
  constructor(...args: number[]) {
    this.args = args
    MockOfflineAudioContext.instances.push(this)
  }
  decodeAudioData = jest.fn(async () => fakeBuffer())
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let engine: SoundEngine
let release: () => void = () => {}
let now = 1000
let visibility: DocumentVisibilityState = 'visible'

function context(): MockAudioContext {
  return MockAudioContext.instances[MockAudioContext.instances.length - 1]
}

function silentPrimes(): MockSource[] {
  return context().sources.filter((source) => (source.buffer as { length?: number } | null)?.length === 1)
}

/** Sources made for cues, leaving out the silent buffers the unlock primes with. */
function cueSources(): MockSource[] {
  return context().sources.filter((source) => !silentPrimes().includes(source))
}

function tap() {
  const event = new Event('pointerup')
  Object.defineProperty(event, 'pointerType', { value: 'touch' })
  window.dispatchEvent(event)
}

async function readyEngine(cues: Parameters<SoundEngine['preload']>[0] = ['ui.select', 'score.add', 'result.win', 'turn.mine']) {
  engine = createSoundEngine()
  release = engine.retain([])
  await engine.preload(cues)
  tap()
  await flush()
  expect(context().state).toBe('running')
}

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})

beforeEach(() => {
  MockAudioContext.instances = []
  MockAudioContext.sampleRate = 48000
  MockAudioContext.resumeMode = 'immediate'
  MockOfflineAudioContext.instances = []
  visibility = 'visible'
  now = 1000
  jest.spyOn(performance, 'now').mockImplementation(() => now)
  Object.assign(window, { AudioContext: MockAudioContext, OfflineAudioContext: MockOfflineAudioContext })
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch
  setSoundEnabled(true)
  setSoundVolume(0.7)
})

afterEach(() => {
  release()
  release = () => {}
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

  it('does not spend a game id on an attempt that could not sound', async () => {
    await readyEngine()

    visibility = 'hidden'
    expect(engine.play('result.win', { gameId: 'g1' })).toBe(false)
    visibility = 'visible'
    setSoundEnabled(false)
    expect(engine.play('result.win', { gameId: 'g1' })).toBe(false)
    setSoundEnabled(true)

    expect(engine.play('result.win', { gameId: 'g1' })).toBe(true)
    now += 10_000
    expect(engine.play('result.win', { gameId: 'g1' })).toBe(false)
  })

  it('skips a cue whose samples are not decoded yet, and never plays it late', async () => {
    engine = createSoundEngine()
    release = engine.retain([])
    tap()
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

  it('retries a sample that failed to load when a play asks for it, after a backoff', async () => {
    const fetchMock = jest.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }))
    global.fetch = fetchMock as unknown as typeof fetch
    engine = createSoundEngine()
    release = engine.retain([])
    tap()
    await flush()
    await engine.preload(['ui.error'])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    expect(engine.play('ui.error')).toBe(false)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }))
    now += 1500
    expect(engine.play('ui.error')).toBe(false)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cueSources()).toHaveLength(0)

    expect(engine.play('ui.error')).toBe(true)
  })

  it('plays someone else’s action 4.5 dB under the viewer’s own, also for a cue with no remote level of its own', async () => {
    await readyEngine()
    await engine.preload(['card.skip'])

    engine.play('card.skip')
    now += 100
    engine.play('card.skip', { remote: true })
    engine.play('turn.mine', { remote: true })

    const [own, remote, turn] = context().gains.slice(1).map((gain) => gain.gain.value)
    expect(20 * Math.log10(own)).toBeCloseTo(-11)
    expect(20 * Math.log10(remote / own)).toBeCloseTo(-4.5)
    expect(20 * Math.log10(turn)).toBeCloseTo(-9 - 4.5)
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
    release = engine.retain(['ui.select'])

    await engine.preload(['ui.select'])
    tap()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(engine.play('ui.select')).toBe(false)
  })

  it('starts each buffer at its measured onset, 2 ms early', () => {
    const buffer = fakeBuffer(9600, 4800) as unknown as AudioBuffer
    expect(measureOnsetSeconds(buffer)).toBeCloseTo(0.098, 5)
    expect(measureOnsetSeconds(fakeBuffer(100, 0) as unknown as AudioBuffer)).toBe(0)
  })
})

describe('sound engine unlock', () => {
  it('ignores events that grant no user activation: a touch pointerdown, Escape, a lone modifier', () => {
    engine = createSoundEngine()
    release = engine.retain([])

    const touchDown = new Event('pointerdown')
    Object.defineProperty(touchDown, 'pointerType', { value: 'touch' })
    window.dispatchEvent(touchDown)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))

    expect(MockAudioContext.instances).toHaveLength(0)
    expect(engine.hasGesture()).toBe(false)
  })

  it('primes on every gesture until the context runs, then stops priming', async () => {
    MockAudioContext.resumeMode = 'never'
    engine = createSoundEngine()
    release = engine.retain([])

    tap()
    window.dispatchEvent(new Event('click'))
    expect(silentPrimes()).toHaveLength(2)
    expect(context().resume).toHaveBeenCalledTimes(2)

    context().state = 'running'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(silentPrimes()).toHaveLength(2)
  })

  it('makes the cue fired by the unlocking tap heard: it schedules on the suspended context while resume is pending', async () => {
    MockAudioContext.resumeMode = 'deferred'
    engine = createSoundEngine()
    release = engine.retain([])
    await engine.preload(['ui.select'])

    tap()
    expect(context().state).toBe('suspended')
    expect(engine.play('ui.select')).toBe(true)
    const [source] = cueSources()
    expect(source.start).toHaveBeenCalled()

    context().finishResume()
    await wait(300)
    expect(source.stop).not.toHaveBeenCalled()
  })

  it('resumes an interrupted context from play(), and drops the cue if it does not run within the grace', async () => {
    await readyEngine()
    MockAudioContext.resumeMode = 'never'
    context().state = 'interrupted'
    const resumes = context().resume.mock.calls.length

    expect(engine.play('ui.select')).toBe(true)
    expect(context().resume).toHaveBeenCalledTimes(resumes + 1)
    const [source] = cueSources()

    await wait(300)
    expect(source.stop).toHaveBeenCalled()
  })

  it('gives back the game id and the min gap when the grace drops a cue the context never ran', async () => {
    await readyEngine()
    MockAudioContext.resumeMode = 'never'
    context().state = 'interrupted'

    expect(engine.play('result.win', { gameId: 'g1' })).toBe(true)
    await wait(300)

    MockAudioContext.resumeMode = 'immediate'
    context().state = 'running'
    expect(engine.play('result.win', { gameId: 'g1' })).toBe(true)
  })

  it('decodes before the gesture at 48 kHz and decodes again at the real rate when it differs', async () => {
    MockAudioContext.sampleRate = 44100
    engine = createSoundEngine()
    release = engine.retain([])
    await engine.preload(['turn.mine'])
    expect(MockOfflineAudioContext.instances[0].args).toEqual([1, 1, 48000])

    tap()
    await flush()
    expect(context().decodeAudioData).toHaveBeenCalledTimes(cueSamples('turn.mine').length)
  })

  it('keeps the pre-gesture buffers when the real context also runs at 48 kHz', async () => {
    await readyEngine(['turn.mine'])
    expect(context().decodeAudioData).not.toHaveBeenCalled()
  })
})

describe('sound engine consumers', () => {
  it('runs only while a consumer is mounted, and suspends with no listeners after the last one leaves', async () => {
    engine = createSoundEngine()
    const releaseLobby = engine.retain([])
    const releaseDevPage = engine.retain([])
    await engine.preload(['ui.select'])
    tap()
    await flush()

    releaseLobby()
    expect(context().suspend).not.toHaveBeenCalled()
    expect(engine.play('ui.select')).toBe(true)

    releaseDevPage()
    expect(context().suspend).toHaveBeenCalledTimes(1)
    expect(context().state).not.toBe('running')
    now += 1000
    expect(engine.play('ui.select')).toBe(false)
    const resumes = context().resume.mock.calls.length
    tap()
    expect(context().resume).toHaveBeenCalledTimes(resumes)

    release = engine.retain([])
    expect(context().resume).toHaveBeenCalledTimes(resumes + 1)
  })

  it('preloads a consumer’s cues at idle, and not at all if it leaves first', async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    engine = createSoundEngine()
    const releaseEarly = engine.retain(['ui.error'])
    releaseEarly()
    release = engine.retain(['ui.confirm'])

    jest.advanceTimersByTime(2000)
    jest.useRealTimers()
    await flush()

    expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['/sounds/kenney/confirmation_001.mp3'])
  })
})
