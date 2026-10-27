'use client'

import { useEffect, useRef, useState } from 'react'
import { useSoundConsumer } from '@/hooks/useSoundConsumer'
import { getSoundEngine, type PlayOptions } from '@/lib/sound-engine'
import {
  CUE_IDS,
  SOUND_SAMPLES,
  cueSamples,
  cuesInGroup,
  getCue,
  type CueId,
  type CueLayer,
  type SoundGroup,
} from '@/lib/sound-map'
import { setSoundEnabled, setSoundVolume } from '@/lib/sound-settings'
import { useSoundSettings } from '@/hooks/useSoundSettings'
import { CUE_NOTES } from './cue-notes'

const GROUPS: { id: SoundGroup; title: string }[] = [
  { id: 'core', title: 'Core – every lobby page' },
  { id: 'social', title: 'Social – any page, signed in' },
  { id: 'cards', title: 'Cards – Memory, Guess the Spy, Alias, Liar’s Party' },
  { id: 'dice', title: 'Dice – Yahtzee, Ludo' },
  { id: 'pieces', title: 'Pieces – Tic-tac-toe, Connect Four, Checkers, Ludo' },
  { id: 'rps', title: 'Rock Paper Scissors' },
]

interface Preset {
  label: string
  steps: { atMs: number; options?: PlayOptions }[]
}

const PRESETS: Partial<Record<CueId, Preset[]>> = {
  'timer.tick': [{ label: 'Countdown 5 to 1', steps: [0, 1, 2, 3, 4].map((i) => ({ atMs: i * 1000, options: { semis: i } })) }],
  'tap.mark': [{ label: 'O, +2 st', steps: [{ atMs: 0, options: { semis: 2 } }] }],
  'die.hold': [{ label: 'Release, +1 st', steps: [{ atMs: 0, options: { semis: -3 } }] }],
  'piece.hop': [
    { label: 'Walk 6 squares', steps: Array.from({ length: 6 }, (_, i) => ({ atMs: i * 140, options: { semis: i * 0.5 } })) },
  ],
}

function signed(value: number, unit: string): string {
  return `${value > 0 ? '+' : ''}${value} ${unit}`
}

function describeLayer(layer: CueLayer): string {
  const parts = [layer.samples.join(' / '), `${layer.db} dB`]
  if (layer.semis) parts.push(signed(layer.semis, 'st'))
  if (layer.delayMs) parts.push(`+${layer.delayMs} ms`)
  if (layer.pan) parts.push(`pan ${signed(layer.pan, '')}`.trim())
  return parts.join(' · ')
}

function groupBytes(group: SoundGroup): { files: number; bytes: number } {
  const samples = new Set(cuesInGroup(group).flatMap((id) => cueSamples(id)))
  return { files: samples.size, bytes: [...samples].reduce((sum, id) => sum + SOUND_SAMPLES[id].bytes, 0) }
}

type Outcome = 'played' | 'skipped'

function CueCard({ id, onPlay, outcome }: { id: CueId; onPlay: (key: string, steps: Preset['steps']) => void; outcome: Record<string, Outcome> }) {
  const cue = getCue(id)
  const presets = PRESETS[id] ?? []
  const buttons: { key: string; label: string; steps: Preset['steps'] }[] = [
    { key: `${id}:own`, label: 'Own', steps: [{ atMs: 0 }] },
    ...(cue.remoteDb !== undefined
      ? [{ key: `${id}:remote`, label: `Remote, ${cue.remoteDb} dB`, steps: [{ atMs: 0, options: { remote: true } }] }]
      : []),
    ...presets.map((preset) => ({ key: `${id}:${preset.label}`, label: preset.label, steps: preset.steps })),
  ]
  const facts = [
    cue.oncePerGame ? 'once per game' : `gap ${cue.minGapMs} ms`,
    cue.jitterSemis ? `jitter ±${cue.jitterSemis} st` : null,
    cue.layers.some((layer) => layer.samples.length > 1) ? 'round-robin' : null,
  ].filter(Boolean)

  return (
    <div className="bd-card flex flex-col gap-3 p-4" style={{ borderRadius: 16 }}>
      <div>
        <code className="text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>{id}</code>
        <p className="mt-1 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{CUE_NOTES[id]}</p>
      </div>
      <ul className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--bd-ink-muted)' }}>
        {cue.layers.map((layer, index) => (
          <li key={index}>{describeLayer(layer)}</li>
        ))}
        <li>{facts.join(' · ')}</li>
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {buttons.map((button) => (
          <button
            key={button.key}
            type="button"
            onClick={() => onPlay(button.key, button.steps)}
            aria-label={`Play ${id}: ${button.label}`}
            className={`bd-chip cursor-pointer ${outcome[button.key] === 'played' ? 'border-bd-ink bg-bd-ink text-bd-bg' : ''}`}
          >
            {button.label}
          </button>
        ))}
        {Object.entries(outcome).some(([key, value]) => key.startsWith(`${id}:`) && value === 'skipped') && (
          <span className="text-[11px]" style={{ color: 'var(--bd-coral-text)' }}>skipped</span>
        )}
      </div>
    </div>
  )
}

export default function SoundBoard() {
  const settings = useSoundSettings()
  const [state, setState] = useState<{ context: string; ready: number }>({ context: 'none', ready: 0 })
  const [outcome, setOutcome] = useState<Record<string, Outcome>>({})
  const gameCounter = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useSoundConsumer(CUE_IDS)

  useEffect(() => {
    const engine = getSoundEngine()
    const refresh = () => setState({ context: engine.contextState(), ready: CUE_IDS.filter((id) => engine.isCueReady(id)).length })
    const interval = setInterval(refresh, 500)
    const pending = timers.current
    return () => {
      clearInterval(interval)
      pending.forEach(clearTimeout)
    }
  }, [])

  const play = (key: string, steps: Preset['steps']) => {
    const [id] = key.split(':') as [CueId]
    const gameId = getCue(id).oncePerGame ? `dev-${(gameCounter.current += 1)}` : undefined
    steps.forEach((step) => {
      const fire = () => {
        const played = getSoundEngine().play(id, { ...step.options, gameId })
        setOutcome((previous) => ({ ...previous, [key]: played ? 'played' : 'skipped' }))
        timers.current.push(setTimeout(() => setOutcome(({ [key]: _done, ...rest }) => rest), 600))
      }
      if (step.atMs === 0) fire()
      else timers.current.push(setTimeout(fire, step.atMs))
    })
  }

  const volumePercent = Math.round(settings.volume * 100)

  return (
    <div className="bd-page min-h-screen px-4 py-8" style={{ background: 'var(--bd-bg)' }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--bd-font-display)', color: 'var(--bd-ink)' }}>
              Boardly sounds
            </h1>
            <p className="text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
              {CUE_IDS.length} cues · {Object.keys(SOUND_SAMPLES).length} Kenney samples · dev only. Tap anywhere first: a
              browser starts audio only after a gesture.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="bd-chip">audio {state.context}</span>
            <span className="bd-chip">
              {state.ready} / {CUE_IDS.length} cues decoded
            </span>
            <button
              type="button"
              onClick={() => setSoundEnabled(!settings.enabled)}
              className={`bd-chip cursor-pointer ${settings.enabled ? '' : 'border-bd-ink bg-bd-ink text-bd-bg'}`}
            >
              {settings.enabled ? 'Mute' : 'Muted – tap to unmute'}
            </button>
            <label className="flex min-w-0 items-center gap-2 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>
              Master volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.volume}
                onChange={(event) => setSoundVolume(parseFloat(event.target.value))}
                className="h-2 w-40 max-w-full cursor-pointer accent-(--bd-ink)"
              />
              <span className="w-10 text-right font-black">{volumePercent}%</span>
            </label>
          </div>
        </header>

        {GROUPS.map((group) => {
          const { files, bytes } = groupBytes(group.id)
          return (
            <section key={group.id} className="mb-10">
              <h2 className="bd-kicker mb-3">
                {group.title} · {files} files, {bytes.toLocaleString('en')} bytes
              </h2>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
                {cuesInGroup(group.id).map((id) => (
                  <CueCard key={id} id={id} onPlay={play} outcome={outcome} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
