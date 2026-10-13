import type { ReplaySnapshotInput, ReplayStep, ReplayStepKind } from './types'

type Data = Record<string, unknown>

export function dataOf(state: unknown): Data | null {
  if (!state || typeof state !== 'object') return null
  const data = (state as { data?: unknown }).data
  return data && typeof data === 'object' ? (data as Data) : null
}

export function stripBotPrefix(actionType: string): { action: string; isBot: boolean } {
  return actionType.startsWith('bot:')
    ? { action: actionType.slice(4), isBot: true }
    : { action: actionType, isBot: false }
}

function kindOf(action: string): ReplayStepKind {
  if (action === 'game:start') return 'start'
  if (action.startsWith('game:') || action.includes('timeout')) return 'system'
  return 'move'
}

type Verdict = 'merge' | 'end' | 'replace' | 'drop' | null

/** How a snapshot joins the step before it, per game. */
const RULES: Record<string, (prev: ReplayStep | null, cur: ReplaySnapshotInput, action: string) => Verdict> = {
  checkers: (prev, cur, action) =>
    prev && action === 'step' && prev.action === 'step' && prev.actorId === cur.playerId && dataOf(prev.state)?.chainFrom != null
      ? 'merge'
      : null,
  memory: (prev, _cur, action) =>
    prev && (action === 'resolve-mismatch' || action === 'timeout-pass') && prev.action === 'flip' ? 'end' : null,
  rock_paper_scissors: (prev, cur, action) =>
    prev && action === 'submit-choice' && prev.action === 'submit-choice' && prev.snapshotIds.length === 1 && prev.actorId !== cur.playerId
      ? 'merge'
      : null,
  guess_the_spy: (prev, _cur, action) =>
    prev && action.endsWith('player-ready') && (prev.action.endsWith('init-round') || prev.action.endsWith('player-ready'))
      ? 'merge'
      : null,
  sketch_and_guess: (prev, _cur, action) =>
    prev && action === 'submit-drawing' && prev.action === 'save-drawing' ? 'replace' : null,
  alias: (prev, _cur, action) => {
    if (action === 'assign_team') return 'drop'
    return prev && action === 'start_round' && prev.action === 'next_turn' ? 'merge' : null
  },
}

/**
 * Snapshots are written per action; a step is what a viewer thinks of as one
 * move. A Checkers multi-jump, the two choices of a Rock Paper Scissors round and a
 * Memory mismatch with its turn-back each become one step.
 */
export function groupSteps(gameType: string, snapshots: ReplaySnapshotInput[]): ReplayStep[] {
  const rule = RULES[gameType]
  const steps: ReplayStep[] = []

  for (const snapshot of snapshots) {
    if (snapshot.state === null || snapshot.state === undefined) continue
    const { action, isBot } = stripBotPrefix(snapshot.actionType)
    const prev = steps.length > 0 ? steps[steps.length - 1] : null
    const verdict = rule ? rule(prev, snapshot, action) : null

    if (verdict === 'drop') continue
    if (prev && verdict === 'merge') {
      prev.state = snapshot.state
      prev.snapshotIds.push(snapshot.id)
      continue
    }
    if (prev && verdict === 'end') {
      prev.endState = snapshot.state
      prev.snapshotIds.push(snapshot.id)
      continue
    }
    if (prev && verdict === 'replace') {
      prev.state = snapshot.state
      prev.action = action
      prev.actionType = snapshot.actionType
      prev.payload = snapshot.actionPayload
      prev.actorId = snapshot.playerId
      prev.isBot = isBot
      prev.snapshotIds.push(snapshot.id)
      continue
    }

    steps.push({
      index: steps.length,
      action,
      actionType: snapshot.actionType,
      actorId: snapshot.playerId,
      isBot,
      payload: snapshot.actionPayload,
      state: snapshot.state,
      prevState: prev ? (prev.endState ?? prev.state) : null,
      snapshotIds: [snapshot.id],
      kind: kindOf(action),
      createdAt: snapshot.createdAt,
    })
  }

  return steps
}
