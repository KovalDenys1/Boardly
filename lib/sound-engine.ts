import { cueSamples, getCue, roundRobinTrimDb, sampleUrl, type CueId, type CueLayer, type SampleId } from '@/lib/sound-map'
import { getSoundSettings, subscribeSoundSettings, type SoundSettings } from '@/lib/sound-settings'

export interface PlayOptions {
  /** Someone else's action; ignored by a cue with no remote level. */
  remote?: boolean
  semis?: number
  /** Attenuation only; a positive value is ignored. */
  gainDb?: number
  delayMs?: number
  /** Without it a once-per-game cue only keeps its min gap. */
  gameId?: string | null
}

export interface SoundEngine {
  play(cue: CueId, options?: PlayOptions): boolean
  /** Marks an audio consumer as mounted and preloads its cues at idle; the release suspends audio after the last one. */
  retain(cues: readonly CueId[]): () => void
  preload(cues: readonly CueId[]): Promise<void>
  stopAll(): void
  isCueReady(cue: CueId): boolean
  hasGesture(): boolean
  contextState(): AudioContextState | 'interrupted' | 'none'
  dispose(): void
}

interface DecodedSample {
  buffer: AudioBuffer
  offset: number
}

interface Voice {
  sources: AudioBufferSourceNode[]
}

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn'])
const MAX_VOICES_PER_CUE = 4
const ONSET_THRESHOLD = 0.01
const ONSET_PRE_ROLL_S = 0.002
const PREGESTURE_SAMPLE_RATE = 48000
const RESUME_GRACE_MS = 250
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30_000
const IDLE_PRELOAD_TIMEOUT_MS = 1500

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext
type OfflineAudioContextCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function offlineAudioContextCtor(): OfflineAudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { OfflineAudioContext?: OfflineAudioContextCtor; webkitOfflineAudioContext?: OfflineAudioContextCtor }
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null
}

function masterLevel(settings: SoundSettings): number {
  return settings.enabled ? settings.volume : 0
}

function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

function isPageVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

function hasStickyActivation(): boolean {
  if (typeof navigator === 'undefined') return false
  return (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true
}

/** The events the HTML spec lets grant user activation: a touch pointerdown or an Escape keydown cannot start audio. */
function isActivation(event: Event): boolean {
  if (event.type === 'keydown') {
    const key = (event as KeyboardEvent).key
    return key !== 'Escape' && !MODIFIER_KEYS.has(key)
  }
  if (event.type === 'pointerdown') return (event as PointerEvent).pointerType === 'mouse'
  if (event.type === 'pointerup') return (event as PointerEvent).pointerType !== 'mouse'
  return true
}

function scheduleIdle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const handle = w.requestIdleCallback(run, { timeout: IDLE_PRELOAD_TIMEOUT_MS })
    return () => w.cancelIdleCallback?.(handle)
  }
  const timer = setTimeout(run, IDLE_PRELOAD_TIMEOUT_MS)
  return () => clearTimeout(timer)
}

function preferAmbientSession() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = 'ambient'
  } catch {
    // The default session still plays.
  }
}

/** Not every browser's MP3 decoder strips the encoder's priming silence, so playback starts at the measured onset. */
export function measureOnsetSeconds(buffer: AudioBuffer): number {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  let peak = 0
  for (const data of channels) {
    for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]))
  }
  if (peak === 0) return 0
  const threshold = peak * ONSET_THRESHOLD
  let first = buffer.length
  for (const data of channels) {
    for (let i = 0; i < first; i += 1) {
      if (Math.abs(data[i]) >= threshold) {
        first = i
        break
      }
    }
  }
  return Math.max(0, first / buffer.sampleRate - ONSET_PRE_ROLL_S)
}

export function createSoundEngine(): SoundEngine {
  let ctx: AudioContext | null = null
  let offline: OfflineAudioContext | null = null
  let master: GainNode | null = null
  let gestureSeen = false
  let consumers = 0
  let unsubscribeSettings: (() => void) | null = null
  let resolveContext: (context: AudioContext) => void = () => {}
  const contextCreated = new Promise<AudioContext>((resolve) => {
    resolveContext = resolve
  })
  const decoded = new Map<SampleId, DecodedSample>()
  const encoded = new Map<SampleId, ArrayBuffer>()
  const loading = new Map<SampleId, Promise<void>>()
  const failures = new Map<SampleId, { count: number; retryAt: number }>()
  const lastPlayedAt = new Map<CueId, number>()
  const lastVariant = new Map<string, SampleId>()
  const gamesPlayed = new Set<string>()
  const voices = new Map<CueId, Voice[]>()
  const pendingPreloads = new Set<() => void>()

  function ensureContext(): AudioContext | null {
    if (ctx) return ctx
    const Ctor = audioContextCtor()
    if (!Ctor) return null
    preferAmbientSession()
    try {
      ctx = new Ctor({ latencyHint: 'interactive' })
    } catch {
      return null
    }
    master = ctx.createGain()
    master.gain.value = masterLevel(getSoundSettings())
    master.connect(ctx.destination)
    for (const sample of [...encoded.keys()]) if (decoded.has(sample)) redecode(sample)
    resolveContext(ctx)
    return ctx
  }

  function requestResume(context: AudioContext) {
    if (context.state === 'running' || context.state === 'closed') return
    context.resume().catch(() => {})
  }

  // An offline context decodes without a gesture, so samples are ready before the first tap creates the real one.
  function decoder(): BaseAudioContext | null {
    if (ctx) return ctx
    if (offline) return offline
    const Offline = offlineAudioContextCtor()
    if (!Offline) return null
    try {
      offline = new Offline(1, 1, PREGESTURE_SAMPLE_RATE)
    } catch {
      return null
    }
    return offline
  }

  function redecode(sample: SampleId) {
    const bytes = encoded.get(sample)
    encoded.delete(sample)
    if (!bytes || !ctx || ctx.sampleRate === PREGESTURE_SAMPLE_RATE) return
    ctx
      .decodeAudioData(bytes)
      .then((buffer) => decoded.set(sample, { buffer, offset: measureOnsetSeconds(buffer) }))
      .catch(() => {})
  }

  function unlock(event: Event) {
    if (!isActivation(event)) return
    gestureSeen = true
    const context = ensureContext()
    if (!context || context.state === 'running') return
    requestResume(context)
    // WebKit unlocks output only for a source started inside the gesture itself, so every gesture primes until it runs.
    const silence = context.createBufferSource()
    silence.buffer = context.createBuffer(1, 1, context.sampleRate)
    silence.connect(context.destination)
    silence.start(0)
  }

  function stopVoice(voice: Voice) {
    for (const source of voice.sources) {
      try {
        source.stop()
      } catch {
        // Already stopped.
      }
    }
  }

  function stopAll() {
    for (const list of voices.values()) list.forEach(stopVoice)
    voices.clear()
  }

  function removeVoice(cue: CueId, voice: Voice) {
    const list = voices.get(cue)
    if (!list) return
    const index = list.indexOf(voice)
    if (index >= 0) list.splice(index, 1)
    if (list.length === 0) voices.delete(cue)
  }

  function onSettingsChange() {
    const level = masterLevel(getSoundSettings())
    if (master) master.gain.value = level
    if (level === 0) stopAll()
  }

  function onVisibilityChange() {
    if (!isPageVisible()) {
      stopAll()
      return
    }
    if (ctx && gestureSeen) requestResume(ctx)
  }

  function install() {
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    unsubscribeSettings = subscribeSoundSettings(onSettingsChange)
    onSettingsChange()
    // Sticky activation from an earlier page lets Chrome and Firefox start the context without a new gesture.
    if (ctx || hasStickyActivation()) {
      const context = ensureContext()
      if (context) requestResume(context)
    }
  }

  function uninstall() {
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, { capture: true })
    document.removeEventListener('visibilitychange', onVisibilityChange)
    unsubscribeSettings?.()
    unsubscribeSettings = null
    stopAll()
    if (ctx && ctx.state !== 'closed') ctx.suspend().catch(() => {})
  }

  function load(sample: SampleId): Promise<void> {
    if (decoded.has(sample) || !audioContextCtor()) return Promise.resolve()
    const pending = loading.get(sample)
    if (pending) return pending
    const failure = failures.get(sample)
    if (failure && performance.now() < failure.retryAt) return Promise.resolve()
    const task = (async () => {
      try {
        const response = await fetch(sampleUrl(sample))
        if (!response.ok) throw new Error(`${response.status}`)
        const data = await response.arrayBuffer()
        const context = decoder() ?? (await contextCreated)
        const preGesture = context !== ctx
        if (preGesture) encoded.set(sample, data.slice(0))
        const buffer = await context.decodeAudioData(data)
        decoded.set(sample, { buffer, offset: measureOnsetSeconds(buffer) })
        failures.delete(sample)
        if (preGesture && ctx) redecode(sample)
      } catch {
        encoded.delete(sample)
        const count = (failure?.count ?? 0) + 1
        failures.set(sample, { count, retryAt: performance.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (count - 1)) })
      } finally {
        loading.delete(sample)
      }
    })()
    loading.set(sample, task)
    return task
  }

  function pickVariant(key: string, layer: CueLayer): SampleId | null {
    const ready = layer.samples.filter((sample) => decoded.has(sample))
    if (ready.length === 0) return null
    const previous = lastVariant.get(key)
    const choices = ready.length > 1 ? ready.filter((sample) => sample !== previous) : ready
    return choices[Math.floor(Math.random() * choices.length)]
  }

  function play(cue: CueId, options: PlayOptions = {}): boolean {
    if (consumers === 0) return false
    const def = getCue(cue)
    const onceKey = def.oncePerGame && options.gameId ? `${cue}:${options.gameId}` : null
    if (onceKey && gamesPlayed.has(onceKey)) return false
    if (masterLevel(getSoundSettings()) <= 0 || !isPageVisible()) return false
    if (!ctx || !master || ctx.state === 'closed') return false

    const now = performance.now()
    const last = lastPlayedAt.get(cue)
    if (last !== undefined && now - last < def.minGapMs) return false

    const picks: SampleId[] = []
    let missing = false
    for (const [index, layer] of def.layers.entries()) {
      const sample = pickVariant(`${cue}:${index}`, layer)
      if (sample) picks.push(sample)
      else {
        missing = true
        layer.samples.forEach((variant) => void load(variant))
      }
    }
    if (missing) return false

    const context = ctx
    const output = master
    const running = context.state === 'running'
    if (!running) requestResume(context)

    const previousPlayedAt = lastPlayedAt.get(cue)
    lastPlayedAt.set(cue, now)
    picks.forEach((sample, index) => lastVariant.set(`${cue}:${index}`, sample))
    if (onceKey) gamesPlayed.add(onceKey)

    const jitter = def.jitterSemis ? (Math.random() * 2 - 1) * def.jitterSemis : 0
    const remoteDb = options.remote && def.remoteDb !== undefined ? def.remoteDb : 0
    const extraDb = Math.min(0, options.gainDb ?? 0)
    const startAt = context.currentTime + Math.max(0, options.delayMs ?? 0) / 1000
    const voice: Voice = { sources: [] }
    let live = def.layers.length

    def.layers.forEach((layer, index) => {
      const sample = picks[index]
      const { buffer, offset } = decoded.get(sample)!
      const source = context.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = 2 ** (((layer.semis ?? 0) + (options.semis ?? 0) + jitter) / 12)
      const gain = context.createGain()
      gain.gain.value = dbToGain(layer.db + roundRobinTrimDb(layer, sample) + remoteDb + extraDb)
      source.connect(gain)
      const nodes: AudioNode[] = [source, gain]
      if (layer.pan && typeof context.createStereoPanner === 'function') {
        const panner = context.createStereoPanner()
        panner.pan.value = layer.pan
        gain.connect(panner)
        nodes.push(panner)
      }
      nodes[nodes.length - 1].connect(output)
      source.onended = () => {
        nodes.forEach((node) => node.disconnect())
        live -= 1
        if (live === 0) removeVoice(cue, voice)
      }
      source.start(startAt + (layer.delayMs ?? 0) / 1000, offset)
      voice.sources.push(source)
    })

    const list = voices.get(cue) ?? []
    while (list.length >= MAX_VOICES_PER_CUE) stopVoice(list.shift()!)
    list.push(voice)
    voices.set(cue, list)

    // A suspended context queues sources on its frozen clock; one that does not run within the grace would play them late.
    if (!running) {
      setTimeout(() => {
        if (context.state === 'running') return
        stopVoice(voice)
        removeVoice(cue, voice)
        if (onceKey) gamesPlayed.delete(onceKey)
        if (lastPlayedAt.get(cue) === now) {
          if (previousPlayedAt === undefined) lastPlayedAt.delete(cue)
          else lastPlayedAt.set(cue, previousPlayedAt)
        }
      }, RESUME_GRACE_MS)
    }
    return true
  }

  function preload(cues: readonly CueId[]): Promise<void> {
    const samples = new Set(cues.flatMap((cue) => cueSamples(cue)))
    return Promise.all([...samples].map(load)).then(() => undefined)
  }

  function retain(cues: readonly CueId[]): () => void {
    if (typeof window === 'undefined') return () => {}
    consumers += 1
    if (consumers === 1) install()
    let cancelPreload: (() => void) | null = null
    if (cues.length > 0) {
      cancelPreload = scheduleIdle(() => {
        if (cancelPreload) pendingPreloads.delete(cancelPreload)
        void preload(cues)
      })
      pendingPreloads.add(cancelPreload)
    }
    let released = false
    return () => {
      if (released) return
      released = true
      if (cancelPreload) {
        cancelPreload()
        pendingPreloads.delete(cancelPreload)
      }
      consumers -= 1
      if (consumers === 0) uninstall()
    }
  }

  return {
    play,
    retain,
    preload,
    stopAll,
    isCueReady: (cue) => getCue(cue).layers.every((layer) => layer.samples.some((sample) => decoded.has(sample))),
    hasGesture: () => gestureSeen || hasStickyActivation(),
    contextState: () => (ctx ? (ctx.state as AudioContextState | 'interrupted') : 'none'),
    dispose: () => {
      pendingPreloads.forEach((cancel) => cancel())
      pendingPreloads.clear()
      if (consumers > 0 && typeof window !== 'undefined') uninstall()
      consumers = 0
      ctx?.close().catch(() => {})
    },
  }
}

let engine: SoundEngine | null = null

export function getSoundEngine(): SoundEngine {
  if (!engine) engine = createSoundEngine()
  return engine
}

export function playCue(cue: CueId, options?: PlayOptions): boolean {
  return getSoundEngine().play(cue, options)
}

export function retainSounds(cues: readonly CueId[]): () => void {
  return getSoundEngine().retain(cues)
}

export function stopAllSounds(): void {
  getSoundEngine().stopAll()
}
