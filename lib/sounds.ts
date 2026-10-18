import { getSoundEngine, type PlayOptions } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'
import { getSoundVolume, isSoundEnabled, setSoundVolume, toggleSoundEnabled } from '@/lib/sound-settings'

const LEGACY_CUES: Record<string, CueId> = {
  diceRoll: 'dice.roll',
  click: 'ui.select',
  win: 'result.win',
  turnChange: 'turn.mine',
  score: 'score.add',
  message: 'chat.incoming',
  playerJoin: 'player.join',
  playerLeave: 'player.leave',
  gameStart: 'game.start',
  celebration: 'yahtzee.celebrate',
  countdown: 'timer.tick',
  cardFlip: 'card.flip',
}

const IDLE_PRELOAD_TIMEOUT_MS = 1500
let preloadScheduled = false

function ensurePreload() {
  if (preloadScheduled || typeof window === 'undefined') return
  preloadScheduled = true
  const run = () => void getSoundEngine().preload(Object.values(LEGACY_CUES))
  const w = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: IDLE_PRELOAD_TIMEOUT_MS })
  else setTimeout(run, IDLE_PRELOAD_TIMEOUT_MS)
}

// The replay page imports this through the Yahtzee dice bar and plays nothing, so only a lobby URL starts audio at import.
if (typeof window !== 'undefined' && window.location.pathname.startsWith('/lobby/')) {
  getSoundEngine()
  ensurePreload()
}

interface LegacyPlayOptions {
  /** The old element volume, 0..1; played as attenuation relative to the master volume. */
  volume?: number
  /** Accepted for old call sites and ignored: one-shots overlap now, and nothing loops. */
  force?: boolean
  loop?: boolean
}

/** The pre-#1464 API, kept so every call site works until each moves to `playCue`. */
export const sounds = {
  play(soundName: string, options: LegacyPlayOptions = {}): void {
    ensurePreload()
    const cue = LEGACY_CUES[soundName]
    if (!cue) return
    const playOptions: PlayOptions = {}
    const master = getSoundVolume()
    if (options.volume !== undefined && master > 0 && options.volume < master) {
      playOptions.gainDb = 20 * Math.log10(Math.max(options.volume, 0.001) / master)
    }
    getSoundEngine().play(cue, playOptions)
  },

  stopAll(): void {
    getSoundEngine().stopAll()
  },

  toggle(): boolean {
    return toggleSoundEnabled()
  },

  setVolume(value: number): void {
    setSoundVolume(value)
  },

  getVolume(): number {
    return getSoundVolume()
  },

  isEnabled(): boolean {
    ensurePreload()
    return isSoundEnabled()
  },

  hasUserInteracted(): boolean {
    ensurePreload()
    return getSoundEngine().hasGesture()
  },
}
