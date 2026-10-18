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

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const
const MAX_VOICES_PER_CUE = 4
const ONSET_THRESHOLD = 0.01
const ONSET_PRE_ROLL_S = 0.002

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
  let primed = false
  let resolveContext: (context: AudioContext) => void = () => {}
  const contextCreated = new Promise<AudioContext>((resolve) => {
    resolveContext = resolve
  })
  const decoded = new Map<SampleId, DecodedSample>()
  const loading = new Map<SampleId, Promise<void>>()
  const lastPlayedAt = new Map<CueId, number>()
  const lastVariant = new Map<string, SampleId>()
  const gamesPlayed = new Set<string>()
  const voices = new Map<CueId, Voice[]>()

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
    resolveContext(ctx)
    return ctx
  }

  function resume(context: AudioContext) {
    if (context.state !== 'running') context.resume().catch(() => {})
  }

  // An offline context decodes without a gesture, so samples are ready before the first tap creates the real one.
  function decoder(): BaseAudioContext | null {
    if (ctx) return ctx
    if (offline) return offline
    const Offline = offlineAudioContextCtor()
    if (!Offline) return null
    try {
      offline = new Offline(1, 1, 44100)
    } catch {
      return null
    }
    return offline
  }

  function unlock() {
    gestureSeen = true
    const context = ensureContext()
    if (!context) return
    resume(context)
    if (primed) return
    primed = true
    // WebKit unlocks output only for a source started inside the gesture itself.
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
    if (ctx && gestureSeen) resume(ctx)
  }

  function load(sample: SampleId): Promise<void> {
    if (decoded.has(sample)) return Promise.resolve()
    const pending = loading.get(sample)
    if (pending) return pending
    const task = (async () => {
      try {
        const response = await fetch(sampleUrl(sample))
        if (!response.ok) return
        const data = await response.arrayBuffer()
        const context = decoder() ?? (await contextCreated)
        const buffer = await context.decodeAudioData(data)
        decoded.set(sample, { buffer, offset: measureOnsetSeconds(buffer) })
      } catch {
        // A sample that fails to load leaves its cues silent; the next preload retries it.
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
    const def = getCue(cue)
    if (def.oncePerGame && options.gameId) {
      const key = `${cue}:${options.gameId}`
      if (gamesPlayed.has(key)) return false
      gamesPlayed.add(key)
    }
    if (masterLevel(getSoundSettings()) <= 0 || !isPageVisible()) return false
    if (!ctx || !master || ctx.state !== 'running') return false

    const now = performance.now()
    const last = lastPlayedAt.get(cue)
    if (last !== undefined && now - last < def.minGapMs) return false

    const picks: SampleId[] = []
    for (const [index, layer] of def.layers.entries()) {
      const sample = pickVariant(`${cue}:${index}`, layer)
      if (!sample) return false
      picks.push(sample)
    }

    lastPlayedAt.set(cue, now)
    picks.forEach((sample, index) => lastVariant.set(`${cue}:${index}`, sample))

    const context = ctx
    const output = master
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
    return true
  }

  function preload(cues: readonly CueId[]): Promise<void> {
    if (!audioContextCtor()) return Promise.resolve()
    const samples = new Set(cues.flatMap((cue) => cueSamples(cue)))
    return Promise.all([...samples].map(load)).then(() => undefined)
  }

  let unsubscribeSettings = () => {}
  if (typeof window !== 'undefined') {
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    unsubscribeSettings = subscribeSoundSettings(onSettingsChange)
    // Sticky activation from an earlier page lets Chrome and Firefox start the context without a new gesture.
    if (hasStickyActivation()) {
      const context = ensureContext()
      if (context) resume(context)
    }
  }

  return {
    play,
    preload,
    stopAll,
    isCueReady: (cue) => getCue(cue).layers.every((layer) => layer.samples.some((sample) => decoded.has(sample))),
    hasGesture: () => gestureSeen || hasStickyActivation(),
    contextState: () => (ctx ? (ctx.state as AudioContextState | 'interrupted') : 'none'),
    dispose: () => {
      stopAll()
      if (typeof window !== 'undefined') {
        for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, { capture: true })
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      unsubscribeSettings()
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

export function preloadSounds(cues: readonly CueId[]): Promise<void> {
  return getSoundEngine().preload(cues)
}

export function stopAllSounds(): void {
  getSoundEngine().stopAll()
}
