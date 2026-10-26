// Levels are dB relative to a sample peak-normalised to -1 dBFS, under a master gain equal to the user's volume.

export type SoundGroup = 'core' | 'social' | 'cards' | 'dice' | 'pieces' | 'rps'

export interface SampleInfo {
  bytes: number
  rmsDbfs: number
}

export const SOUND_SAMPLES = {
  toggle_001: { bytes: 2551, rmsDbfs: -14.6 },
  toggle_002: { bytes: 2551, rmsDbfs: -12.6 },
  toggle_003: { bytes: 2551, rmsDbfs: -14.8 },
  confirmation_001: { bytes: 4432, rmsDbfs: -11.8 },
  confirmation_002: { bytes: 7253, rmsDbfs: -15.4 },
  confirmation_003: { bytes: 4746, rmsDbfs: -15.7 },
  error_008: { bytes: 2551, rmsDbfs: -21.1 },
  question_002: { bytes: 4746, rmsDbfs: -10.6 },
  pluck_001: { bytes: 1924, rmsDbfs: -22.6 },
  pluck_002: { bytes: 2551, rmsDbfs: -22.8 },
  glass_002: { bytes: 2238, rmsDbfs: -19.3 },
  glass_004: { bytes: 8507, rmsDbfs: -18 },
  glass_005: { bytes: 1924, rmsDbfs: -20.1 },
  tick_002: { bytes: 984, rmsDbfs: -18.3 },
  tick_004: { bytes: 1611, rmsDbfs: -16.8 },
  bong_001: { bytes: 2238, rmsDbfs: -16.8 },
  drop_001: { bytes: 2238, rmsDbfs: -21.3 },
  drop_002: { bytes: 2551, rmsDbfs: -18.9 },
  drop_003: { bytes: 2551, rmsDbfs: -18.8 },
  drop_004: { bytes: 2865, rmsDbfs: -19.2 },
  'card-slide-1': { bytes: 3492, rmsDbfs: -22.2 },
  'card-slide-2': { bytes: 7880, rmsDbfs: -25.9 },
  'card-slide-4': { bytes: 6313, rmsDbfs: -27.6 },
  'card-slide-6': { bytes: 5373, rmsDbfs: -25.7 },
  'card-place-1': { bytes: 4119, rmsDbfs: -23.4 },
  'card-place-2': { bytes: 4119, rmsDbfs: -29.3 },
  'card-place-3': { bytes: 5373, rmsDbfs: -29.6 },
  'card-place-4': { bytes: 7880, rmsDbfs: -29.3 },
  'card-shove-1': { bytes: 10075, rmsDbfs: -29.2 },
  'card-shove-2': { bytes: 10075, rmsDbfs: -32.2 },
  'card-shove-3': { bytes: 9134, rmsDbfs: -27.9 },
  'chip-lay-1': { bytes: 2238, rmsDbfs: -24.4 },
  'chip-lay-2': { bytes: 2551, rmsDbfs: -28.2 },
  'chip-lay-3': { bytes: 3492, rmsDbfs: -24.9 },
  'chips-stack-2': { bytes: 2551, rmsDbfs: -29 },
  'chips-stack-3': { bytes: 5059, rmsDbfs: -29.4 },
  'chips-stack-4': { bytes: 3178, rmsDbfs: -25.6 },
  'chips-stack-5': { bytes: 2551, rmsDbfs: -28.1 },
  'chips-collide-1': { bytes: 2551, rmsDbfs: -25.9 },
  'chips-collide-2': { bytes: 2865, rmsDbfs: -27.9 },
  'chips-handle-3': { bytes: 3178, rmsDbfs: -27.8 },
  'dice-throw-1': { bytes: 7567, rmsDbfs: -30.4 },
  'dice-throw-2': { bytes: 4746, rmsDbfs: -31.1 },
  'dice-throw-3': { bytes: 6940, rmsDbfs: -24.1 },
  'die-throw-1': { bytes: 4746, rmsDbfs: -30.2 },
  'die-throw-2': { bytes: 7567, rmsDbfs: -25.5 },
  'die-throw-3': { bytes: 8194, rmsDbfs: -30.8 },
  impactWood_light_000: { bytes: 2551, rmsDbfs: -19.9 },
  impactWood_light_001: { bytes: 2551, rmsDbfs: -22.2 },
  impactWood_light_002: { bytes: 2551, rmsDbfs: -19.7 },
  impactWood_light_003: { bytes: 2551, rmsDbfs: -21.8 },
  impactWood_light_004: { bytes: 2551, rmsDbfs: -22.5 },
  impactWood_medium_000: { bytes: 3492, rmsDbfs: -21.5 },
  impactWood_medium_002: { bytes: 3805, rmsDbfs: -21.9 },
  impactWood_heavy_002: { bytes: 4432, rmsDbfs: -19.4 },
  impactSoft_medium_001: { bytes: 2865, rmsDbfs: -15.4 },
  impactSoft_medium_002: { bytes: 2551, rmsDbfs: -14.6 },
  impactSoft_medium_003: { bytes: 2551, rmsDbfs: -14.7 },
  cloth2: { bytes: 5373, rmsDbfs: -20.4 },
  cloth3: { bytes: 6626, rmsDbfs: -17.3 },
} as const satisfies Record<string, SampleInfo>

export type SampleId = keyof typeof SOUND_SAMPLES

export interface CueLayer {
  samples: readonly SampleId[]
  db: number
  semis?: number
  delayMs?: number
  pan?: number
}

export interface CueDef {
  group: SoundGroup
  layers: readonly CueLayer[]
  jitterSemis?: number
  remoteDb?: number
  minGapMs: number
  oncePerGame?: boolean
}

export const REMOTE_DB = -4.5

// Without a game id, a once-per-game cue falls back to this gap, which still swallows a shell and a page reporting the same finish.
export const ONCE_PER_GAME_FALLBACK_GAP_MS = 3000

export const SOUND_CUES = {
  'ui.select': {
    group: 'core',
    layers: [{ samples: ['toggle_001', 'toggle_002', 'toggle_003'], db: -16 }],
    jitterSemis: 0.5,
    minGapMs: 40,
  },
  'ui.confirm': {
    group: 'core',
    layers: [{ samples: ['confirmation_001'], db: -14 }],
    minGapMs: 300,
  },
  'ui.error': {
    group: 'core',
    layers: [{ samples: ['error_008'], db: -12 }],
    minGapMs: 500,
  },
  'turn.mine': {
    group: 'core',
    layers: [
      { samples: ['pluck_001'], db: -9 },
      { samples: ['pluck_002'], db: -10, semis: 2, delayMs: 90 },
    ],
    minGapMs: 800,
  },
  'timer.tick': {
    group: 'core',
    layers: [{ samples: ['tick_002'], db: -14 }],
    minGapMs: 700,
  },
  'timer.expired': {
    group: 'core',
    layers: [{ samples: ['bong_001'], db: -14, semis: -5 }],
    minGapMs: 1000,
  },
  'player.join': {
    group: 'core',
    layers: [{ samples: ['drop_002'], db: -10, semis: 2 }],
    jitterSemis: 0.3,
    minGapMs: 600,
  },
  'player.leave': {
    group: 'core',
    layers: [{ samples: ['drop_003'], db: -13, semis: -3 }],
    jitterSemis: 0.3,
    minGapMs: 600,
  },
  'chat.incoming': {
    group: 'core',
    layers: [{ samples: ['drop_001'], db: -13, semis: 3 }],
    jitterSemis: 0.5,
    minGapMs: 1500,
  },
  'game.start': {
    group: 'core',
    layers: [
      { samples: ['impactWood_medium_002'], db: -10 },
      { samples: ['chips-stack-3'], db: -12, delayMs: 80 },
    ],
    minGapMs: 2000,
  },
  'score.add': {
    group: 'core',
    layers: [{ samples: ['chips-stack-2', 'chips-stack-4', 'chips-stack-5'], db: -6 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 60,
  },
  'round.end': {
    group: 'core',
    layers: [{ samples: ['chips-stack-3'], db: -7 }],
    minGapMs: 1000,
  },
  'round.won': {
    group: 'core',
    layers: [
      { samples: ['chips-stack-5'], db: -6 },
      { samples: ['glass_005'], db: -18, semis: 7, delayMs: 60 },
    ],
    minGapMs: 1000,
  },
  'round.lost': {
    group: 'core',
    layers: [{ samples: ['cloth3'], db: -16 }],
    minGapMs: 1000,
  },
  'round.draw': {
    group: 'core',
    layers: [{ samples: ['tick_004'], db: -14, semis: 2 }],
    minGapMs: 1000,
  },
  'result.win': {
    group: 'core',
    layers: [
      { samples: ['glass_002'], db: -9, pan: -0.3 },
      { samples: ['glass_002'], db: -9, semis: 4, delayMs: 75, pan: -0.1 },
      { samples: ['glass_002'], db: -9, semis: 7, delayMs: 150, pan: 0.1 },
      { samples: ['glass_002'], db: -9, semis: 12, delayMs: 225, pan: 0.3 },
      { samples: ['pluck_001'], db: -9, delayMs: 300 },
      { samples: ['glass_004'], db: -14, semis: 5, delayMs: 300 },
      { samples: ['pluck_002'], db: -9, semis: 2, delayMs: 450 },
    ],
    minGapMs: ONCE_PER_GAME_FALLBACK_GAP_MS,
    oncePerGame: true,
  },
  'result.loss': {
    group: 'core',
    layers: [
      { samples: ['cloth2'], db: -12 },
      { samples: ['pluck_001'], db: -14, semis: -3, delayMs: 60 },
    ],
    minGapMs: ONCE_PER_GAME_FALLBACK_GAP_MS,
    oncePerGame: true,
  },
  'result.draw': {
    group: 'core',
    layers: [
      { samples: ['glass_002'], db: -12 },
      { samples: ['glass_002'], db: -12, semis: 5, delayMs: 90 },
    ],
    minGapMs: ONCE_PER_GAME_FALLBACK_GAP_MS,
    oncePerGame: true,
  },
  'result.over': {
    group: 'core',
    layers: [{ samples: ['chips-stack-3'], db: -9 }],
    minGapMs: ONCE_PER_GAME_FALLBACK_GAP_MS,
    oncePerGame: true,
  },
  'social.invite': {
    group: 'social',
    layers: [{ samples: ['confirmation_002'], db: -13 }],
    minGapMs: 3000,
  },
  'social.ask': {
    group: 'social',
    layers: [{ samples: ['question_002'], db: -19 }],
    minGapMs: 3000,
  },
  'card.flip': {
    group: 'cards',
    layers: [{ samples: ['card-slide-1', 'card-slide-6'], db: -8 }],
    jitterSemis: 0.7,
    remoteDb: REMOTE_DB,
    minGapMs: 40,
  },
  'card.down': {
    group: 'cards',
    layers: [
      { samples: ['card-place-1'], db: -10 },
      { samples: ['card-place-2'], db: -10, delayMs: 70 },
    ],
    jitterSemis: 0.3,
    remoteDb: REMOTE_DB,
    minGapMs: 200,
  },
  'card.collect': {
    group: 'cards',
    layers: [
      { samples: ['card-shove-3'], db: -9 },
      { samples: ['glass_005'], db: -18, semis: 7, delayMs: 120 },
    ],
    remoteDb: REMOTE_DB,
    minGapMs: 200,
  },
  'card.deal': {
    group: 'cards',
    layers: [{ samples: ['card-shove-1'], db: -9 }],
    minGapMs: 1000,
  },
  'card.place': {
    group: 'cards',
    layers: [{ samples: ['card-place-3', 'card-place-4'], db: -6 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 80,
  },
  'card.correct': {
    group: 'cards',
    layers: [
      { samples: ['card-slide-2'], db: -9 },
      { samples: ['chips-stack-2'], db: -8, delayMs: 60 },
    ],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 80,
  },
  'card.skip': {
    group: 'cards',
    layers: [{ samples: ['card-shove-2'], db: -11 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 80,
  },
  'vote.cast': {
    group: 'core',
    layers: [{ samples: ['toggle_002', 'toggle_003'], db: -13 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 150,
  },
  'verdict.stamp': {
    group: 'cards',
    layers: [{ samples: ['impactWood_heavy_002'], db: -8 }],
    minGapMs: 1000,
  },
  'player.out': {
    group: 'cards',
    layers: [{ samples: ['drop_004'], db: -10, semis: -2 }],
    minGapMs: 1000,
  },
  'dice.roll': {
    group: 'dice',
    layers: [{ samples: ['dice-throw-1', 'dice-throw-2', 'dice-throw-3'], db: -3 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 150,
  },
  'die.roll': {
    group: 'dice',
    layers: [{ samples: ['die-throw-1', 'die-throw-2', 'die-throw-3'], db: -4 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 150,
  },
  'die.hold': {
    group: 'dice',
    layers: [{ samples: ['impactWood_light_000', 'impactWood_light_002'], db: -14, semis: 4 }],
    jitterSemis: 0.3,
    remoteDb: REMOTE_DB,
    minGapMs: 40,
  },
  'yahtzee.celebrate': {
    group: 'dice',
    layers: [
      { samples: ['glass_002'], db: -11 },
      { samples: ['glass_002'], db: -11, semis: 4, delayMs: 70 },
      { samples: ['glass_002'], db: -11, semis: 7, delayMs: 140 },
      { samples: ['chips-stack-3'], db: -7, delayMs: 60 },
    ],
    remoteDb: REMOTE_DB,
    minGapMs: 1000,
  },
  'tap.mark': {
    group: 'pieces',
    layers: [{ samples: ['impactWood_light_000', 'impactWood_light_001', 'impactWood_light_002', 'impactWood_light_003', 'impactWood_light_004'], db: -9 }],
    jitterSemis: 0.3,
    remoteDb: REMOTE_DB,
    minGapMs: 60,
  },
  'piece.place': {
    group: 'pieces',
    layers: [{ samples: ['chip-lay-1', 'chip-lay-2', 'chip-lay-3'], db: -6 }],
    jitterSemis: 0.5,
    remoteDb: REMOTE_DB,
    minGapMs: 40,
  },
  'piece.hop': {
    group: 'pieces',
    layers: [{ samples: ['impactWood_light_001', 'impactWood_light_003', 'impactWood_light_004'], db: -19 }],
    jitterSemis: 0.2,
    remoteDb: REMOTE_DB,
    minGapMs: 40,
  },
  'piece.capture': {
    group: 'pieces',
    layers: [
      { samples: ['chips-collide-1', 'chips-collide-2'], db: -7 },
      { samples: ['impactWood_medium_000'], db: -12 },
    ],
    jitterSemis: 0.4,
    remoteDb: REMOTE_DB,
    minGapMs: 60,
  },
  'piece.king': {
    group: 'pieces',
    layers: [
      { samples: ['chips-stack-4'], db: -6 },
      { samples: ['glass_005'], db: -18, semis: 5, delayMs: 80 },
    ],
    remoteDb: REMOTE_DB,
    minGapMs: 300,
  },
  'piece.enter': {
    group: 'pieces',
    layers: [{ samples: ['chips-handle-3'], db: -9 }],
    jitterSemis: 0.3,
    remoteDb: REMOTE_DB,
    minGapMs: 100,
  },
  'piece.home': {
    group: 'pieces',
    layers: [
      { samples: ['chips-stack-4'], db: -6 },
      { samples: ['glass_005'], db: -16, semis: 7, delayMs: 80 },
    ],
    remoteDb: REMOTE_DB,
    minGapMs: 300,
  },
  'rps.shake': {
    group: 'rps',
    layers: [
      { samples: ['impactSoft_medium_001'], db: -13 },
      { samples: ['impactSoft_medium_002'], db: -13, delayMs: 250 },
      { samples: ['impactSoft_medium_003'], db: -13, delayMs: 500 },
    ],
    minGapMs: 1000,
  },
  'rps.throw': {
    group: 'rps',
    layers: [{ samples: ['card-slide-4'], db: -10 }],
    minGapMs: 1000,
  },
  'guess.close': {
    group: 'core',
    layers: [{ samples: ['tick_004'], db: -14, semis: 5 }],
    minGapMs: 300,
  },
  'guess.correct': {
    group: 'core',
    layers: [
      { samples: ['confirmation_003'], db: -12 },
      { samples: ['chips-stack-2'], db: -7, delayMs: 60 },
    ],
    minGapMs: 300,
  },
} as const satisfies Record<string, CueDef>

export type CueId = keyof typeof SOUND_CUES

export const CUE_IDS = Object.keys(SOUND_CUES) as CueId[]

export const ROUND_ROBIN_TRIM_CAP_DB = 4

export function getCue(id: CueId): CueDef {
  return SOUND_CUES[id]
}

export function sampleUrl(id: SampleId): string {
  return `/sounds/kenney/${id}.mp3`
}

export function cueSamples(id: CueId): SampleId[] {
  return [...new Set(getCue(id).layers.flatMap((layer) => layer.samples))]
}

export function cuesInGroup(group: SoundGroup): CueId[] {
  return CUE_IDS.filter((id) => getCue(id).group === group)
}

/** Brings a round-robin variant to the RMS of the layer's first variant, so no variant of a cue is louder than the others. */
export function roundRobinTrimDb(layer: CueLayer, sample: SampleId): number {
  const reference = SOUND_SAMPLES[layer.samples[0]].rmsDbfs
  const trim = reference - SOUND_SAMPLES[sample].rmsDbfs
  return Math.max(-ROUND_ROBIN_TRIM_CAP_DB, Math.min(ROUND_ROBIN_TRIM_CAP_DB, trim))
}
