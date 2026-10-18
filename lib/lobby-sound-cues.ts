import { cuesInGroup, type CueId, type SoundGroup } from '@/lib/sound-map'

const GAME_SOUND_GROUPS: Record<string, readonly SoundGroup[]> = {
  yahtzee: ['dice'],
  ludo: ['dice', 'pieces'],
  tic_tac_toe: ['pieces'],
  connect_four: ['pieces'],
  checkers: ['pieces'],
  memory: ['cards'],
  guess_the_spy: ['cards'],
  alias: ['cards'],
  liars_party: ['cards'],
  rock_paper_scissors: ['rps'],
}

/** What a lobby page preloads: the core and social cues, plus its own game's group. */
export function lobbySoundCues(gameType: string | null | undefined): CueId[] {
  const groups: SoundGroup[] = ['core', 'social', ...(gameType ? GAME_SOUND_GROUPS[gameType] ?? [] : [])]
  return groups.flatMap(cuesInGroup)
}
