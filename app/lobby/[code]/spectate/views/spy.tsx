import type { SpectatorViewProps } from '.'

export default function SpyView({ state }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const questionHistory = Array.isArray(data.questionHistory) ? data.questionHistory : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Phase: {data.phase || '-'}
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Round: {data.currentRound || '-'} / {data.totalRounds || '-'}
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Location: {data.location || 'Hidden'}
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Questions: {questionHistory.length}
        </div>
      </div>
      <div className="rounded-2xl border border-bd-line bg-[var(--bd-bg)] p-3">
        <div className="mb-2 text-sm font-bold">Recent Q&A</div>
        <div className="space-y-2 text-sm">
          {questionHistory.slice(-5).map((entry: Record<string, unknown>, index: number) => (
            <div
              key={`${index}-${typeof entry.timestamp === 'number' ? entry.timestamp : index}`}
              className="rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2"
            >
              <div className="font-medium">
                {typeof entry.askerName === 'string' ? entry.askerName : 'Player'} → {typeof entry.targetName === 'string' ? entry.targetName : 'Player'}
              </div>
              <div className="text-bd-ink-soft">{typeof entry.question === 'string' ? entry.question : '-'}</div>
              <div className="text-bd-ink-muted">{typeof entry.answer === 'string' ? entry.answer : '-'}</div>
            </div>
          ))}
          {questionHistory.length === 0 && <div className="text-bd-ink-muted">No questions yet</div>}
        </div>
      </div>
    </div>
  )
}
