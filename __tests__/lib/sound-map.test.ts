import { readdirSync, statSync } from 'fs'
import path from 'path'
import {
  CUE_IDS,
  SOUND_CUES,
  SOUND_SAMPLES,
  cueSamples,
  cuesInGroup,
  getCue,
  roundRobinTrimDb,
  type SampleId,
} from '@/lib/sound-map'
import { CUE_NOTES } from '@/app/dev/sounds/cue-notes'

const KENNEY_DIR = path.join(process.cwd(), 'public', 'sounds', 'kenney')
const filesOnDisk = readdirSync(KENNEY_DIR).filter((name) => name.endsWith('.mp3'))

describe('sound map', () => {
  it('has a file in public/sounds/kenney for every sample, at the size the manifest recorded', () => {
    for (const [id, info] of Object.entries(SOUND_SAMPLES)) {
      const file = path.join(KENNEY_DIR, `${id}.mp3`)
      expect(statSync(file).size).toBe(info.bytes)
    }
  })

  it('ships no MP3 that the manifest does not know', () => {
    const known = new Set(Object.keys(SOUND_SAMPLES).map((id) => `${id}.mp3`))
    expect(filesOnDisk.filter((name) => !known.has(name))).toEqual([])
  })

  it('uses every sample in the manifest, and only those', () => {
    const used = new Set(CUE_IDS.flatMap((id) => cueSamples(id)))
    expect([...used].filter((id) => !(id in SOUND_SAMPLES))).toEqual([])
    expect(Object.keys(SOUND_SAMPLES).filter((id) => !used.has(id as SampleId))).toEqual([])
  })

  it.each(CUE_IDS)('%s has at least one layer and every layer at least one sample', (id) => {
    const cue = getCue(id)
    expect(cue.layers.length).toBeGreaterThan(0)
    for (const layer of cue.layers) expect(layer.samples.length).toBeGreaterThan(0)
  })

  it.each(CUE_IDS)('%s never gains above 0 dB, round-robin trim included', (id) => {
    for (const layer of getCue(id).layers) {
      expect(layer.db).toBeLessThanOrEqual(0)
      for (const sample of layer.samples) {
        expect(layer.db + roundRobinTrimDb(layer, sample)).toBeLessThanOrEqual(0)
      }
    }
  })

  it.each(CUE_IDS)('%s keeps pan, offsets, jitter and gaps in range', (id) => {
    const cue = getCue(id)
    expect(cue.minGapMs).toBeGreaterThan(0)
    expect(cue.jitterSemis ?? 0).toBeGreaterThanOrEqual(0)
    if (cue.remoteDb !== undefined) expect(cue.remoteDb).toBeLessThan(0)
    for (const layer of cue.layers) {
      expect(Math.abs(layer.pan ?? 0)).toBeLessThanOrEqual(1)
      expect(layer.delayMs ?? 0).toBeGreaterThanOrEqual(0)
      expect(Math.abs(layer.semis ?? 0)).toBeLessThanOrEqual(12)
    }
  })

  it('caps the round-robin trim at 4 dB either way', () => {
    const layer = { samples: ['dice-throw-1', 'dice-throw-3'] as const, db: -3 }
    expect(roundRobinTrimDb(layer, 'dice-throw-1')).toBe(0)
    expect(Math.abs(roundRobinTrimDb(layer, 'dice-throw-3'))).toBeLessThanOrEqual(4)
  })

  it('marks exactly the four result cues once per game', () => {
    const once = CUE_IDS.filter((id) => getCue(id).oncePerGame)
    expect(once.sort()).toEqual(['result.draw', 'result.loss', 'result.over', 'result.win'])
  })

  it('puts every cue in one load group', () => {
    const grouped = (['core', 'social', 'cards', 'dice', 'pieces', 'rps'] as const).flatMap((group) => cuesInGroup(group))
    expect(grouped.sort()).toEqual([...CUE_IDS].sort())
  })

  it('describes every cue for the /dev/sounds page', () => {
    expect(Object.keys(CUE_NOTES).sort()).toEqual(Object.keys(SOUND_CUES).sort())
  })
})
