let lastLiveFinish = { seq: 0, at: Number.NEGATIVE_INFINITY }

/** A game on screen went from running to finished while this page showed it. */
export function noteLiveFinish(): void {
  lastLiveFinish = { seq: lastLiveFinish.seq + 1, at: performance.now() }
}

/** The latest live finish's sequence number, if it happened within `ms`. */
export function liveFinishWithin(ms: number): number | null {
  return performance.now() - lastLiveFinish.at <= ms ? lastLiveFinish.seq : null
}

export function resetLiveFinish(): void {
  lastLiveFinish = { seq: 0, at: Number.NEGATIVE_INFINITY }
}
