// Generates synthetic WAV sound files for missing Boardly game events.
// Run: node scripts/generate-sounds.mjs

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/sounds')

const SAMPLE_RATE = 44100
const CHANNELS = 1
const BITS = 16
const MAX_INT16 = 32767

function buildWav(samples) {
  const dataLen = samples.length * 2
  const buf = Buffer.alloc(44 + dataLen)

  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)              // PCM
  buf.writeUInt16LE(CHANNELS, 22)
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28)
  buf.writeUInt16LE(CHANNELS * (BITS / 8), 32)
  buf.writeUInt16LE(BITS, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)

  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * MAX_INT16), 44 + i * 2)
  }
  return buf
}

// ADSR envelope value at time t within a note of given duration
function envelope(t, dur, attack = 0.01, decay = 0.05, sustain = 0.7, release = 0.1) {
  if (t < attack) return t / attack
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay)
  if (t < dur - release) return sustain
  if (t < dur) return sustain * (1 - (t - (dur - release)) / release)
  return 0
}

function sine(freq, t) {
  return Math.sin(2 * Math.PI * freq * t)
}

// Single tone with ADSR
function tone(freq, dur, amp = 0.8, opts = {}) {
  const n = Math.floor(SAMPLE_RATE * dur)
  return Array.from({ length: n }, (_, i) => {
    const t = i / SAMPLE_RATE
    const env = envelope(t, dur, opts.attack ?? 0.01, opts.decay ?? 0.05, opts.sustain ?? 0.7, opts.release ?? 0.1)
    return amp * env * sine(freq, t)
  })
}

// Sequence of notes with a gap between them
function sequence(notes, gap = 0) {
  const gapSamples = Array(Math.floor(SAMPLE_RATE * gap)).fill(0)
  return notes.flatMap((s, i) => i < notes.length - 1 ? [...s, ...gapSamples] : s)
}

// Mix two sample arrays (sum, clamp)
function mix(...arrays) {
  const len = Math.max(...arrays.map(a => a.length))
  return Array.from({ length: len }, (_, i) =>
    Math.max(-1, Math.min(1, arrays.reduce((s, a) => s + (a[i] ?? 0), 0)))
  )
}

// --- Sound definitions ---

const sounds = {
  // Soft two-note chime (C6→E6) — chat message
  'message': () => {
    const c6 = tone(1046.5, 0.18, 0.55, { attack: 0.005, decay: 0.04, sustain: 0.5, release: 0.08 })
    const e6 = tone(1318.5, 0.22, 0.45, { attack: 0.005, decay: 0.04, sustain: 0.4, release: 0.12 })
    return sequence([c6, e6], 0.02)
  },

  // Ascending "pop" chime (E5→G5) — player joins lobby
  'player-join': () => {
    const e5 = tone(659.25, 0.14, 0.6, { attack: 0.005, decay: 0.03, sustain: 0.55, release: 0.07 })
    const g5 = tone(783.99, 0.20, 0.7, { attack: 0.005, decay: 0.04, sustain: 0.6, release: 0.10 })
    return sequence([e5, g5], 0.025)
  },

  // Descending soft chord (G5→E5) — player leaves
  'player-leave': () => {
    const g5 = tone(783.99, 0.14, 0.5, { attack: 0.005, decay: 0.03, sustain: 0.4, release: 0.07 })
    const e5 = tone(659.25, 0.18, 0.4, { attack: 0.005, decay: 0.04, sustain: 0.3, release: 0.10 })
    return sequence([g5, e5], 0.02)
  },

  // Three-note ascending fanfare C5→E5→G5 — game starts
  'game-start': () => {
    const c5 = tone(523.25, 0.15, 0.7, { attack: 0.01, decay: 0.04, sustain: 0.65, release: 0.05 })
    const e5 = tone(659.25, 0.15, 0.75, { attack: 0.01, decay: 0.04, sustain: 0.7, release: 0.05 })
    const g5 = tone(783.99, 0.30, 0.8, { attack: 0.01, decay: 0.05, sustain: 0.72, release: 0.12 })
    return sequence([c5, e5, g5], 0.03)
  },

  // Rich four-note arpeggio C5→E5→G5→C6 — celebration (distinct from plain win)
  'celebration': () => {
    const c5 = tone(523.25, 0.14, 0.65, { attack: 0.008, decay: 0.04, sustain: 0.6, release: 0.05 })
    const e5 = tone(659.25, 0.14, 0.70, { attack: 0.008, decay: 0.04, sustain: 0.65, release: 0.05 })
    const g5 = tone(783.99, 0.14, 0.75, { attack: 0.008, decay: 0.04, sustain: 0.68, release: 0.05 })
    const c6 = tone(1046.5, 0.40, 0.80, { attack: 0.010, decay: 0.06, sustain: 0.70, release: 0.18 })
    // Add a harmony on the last note
    const e6 = tone(1318.5, 0.38, 0.40, { attack: 0.015, decay: 0.06, sustain: 0.35, release: 0.15 })
    const last = mix(c6, e6)
    return sequence([c5, e5, g5, last], 0.025)
  },

  // Short single tick at 880 Hz — countdown last seconds
  'countdown': () => {
    return tone(880, 0.08, 0.75, { attack: 0.002, decay: 0.01, sustain: 0.5, release: 0.04 })
  },

  // Short "swish" noise burst — card flip for Memory
  'card-flip': () => {
    const dur = 0.10
    const n = Math.floor(SAMPLE_RATE * dur)
    return Array.from({ length: n }, (_, i) => {
      const t = i / SAMPLE_RATE
      const env = envelope(t, dur, 0.003, 0.02, 0.3, 0.05)
      // White noise + high-frequency sine for a crisp click
      const noise = (Math.random() * 2 - 1) * 0.4
      const click = sine(3200, t) * 0.3
      return env * (noise + click)
    })
  },
}

for (const [name, gen] of Object.entries(sounds)) {
  const samples = gen()
  const wav = buildWav(samples)
  const path = join(OUT_DIR, `${name}.wav`)
  writeFileSync(path, wav)
  console.log(`✅ ${name}.wav  (${(wav.length / 1024).toFixed(1)} KB, ${(samples.length / SAMPLE_RATE * 1000).toFixed(0)}ms)`)
}

console.log('\nDone. Update lib/sounds.ts to use the new .wav files.')
