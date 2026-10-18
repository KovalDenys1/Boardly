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

/** The cue an old sound name now plays, for the hooks that still accept one. */
export function legacyCue(soundName: string): CueId | undefined {
  return LEGACY_CUES[soundName]
}

/** What a page that still plays through this facade passes to `useSoundConsumer`. */
export const LEGACY_SOUND_CUES: readonly CueId[] = [...new Set(Object.values(LEGACY_CUES))]

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
    const cue = legacyCue(soundName)
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
    return isSoundEnabled()
  },

  hasUserInteracted(): boolean {
    return getSoundEngine().hasGesture()
  },
}
