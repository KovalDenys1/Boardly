/**
 * What changed on a Memory board between two snapshots (#1114): which cards
 * just turned face up (for the opponent's flip sound) and which just became a
 * matched pair (for the match cue). Pure, so the board only has to remember
 * the previous snapshot's ids.
 */

export interface MemoryCardLike {
  id: string
  isFlipped: boolean
  isMatched: boolean
}

/** Ids present in `current` but not in `previous`. No previous snapshot means nothing is new: that is state loading in. */
export function idsAddedSince(previous: ReadonlySet<string> | null, current: readonly string[]): string[] {
  if (!previous) return []
  return current.filter((id) => !previous.has(id))
}

export function faceUpCardIds(cards: readonly MemoryCardLike[]): string[] {
  return cards.filter((card) => card.isFlipped || card.isMatched).map((card) => card.id)
}

export function matchedCardIds(cards: readonly MemoryCardLike[]): string[] {
  return cards.filter((card) => card.isMatched).map((card) => card.id)
}

/**
 * Flips that arrived from someone else: newly face-up cards the viewer did not
 * flip themselves. `ownFlips` is the set of ids the viewer clicked; ids found
 * here are removed from it, so a card the viewer flipped earlier and that went
 * back face down still sounds when the opponent turns it later.
 */
export function takeRemoteFlips(arrived: readonly string[], ownFlips: Set<string>): string[] {
  const remote: string[] = []
  for (const id of arrived) {
    if (ownFlips.has(id)) ownFlips.delete(id)
    else remote.push(id)
  }
  return remote
}
