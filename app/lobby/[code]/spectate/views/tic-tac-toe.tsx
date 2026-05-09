import type { SpectatorViewProps } from '.'

export default function TicTacToeView({ state }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const board = Array.isArray(data.board) ? data.board : []

  return (
    <div className="space-y-4">
      <div className="mx-auto grid w-fit grid-cols-3 gap-2 rounded-3xl border-[1.5px] border-bd-line bg-bd-card-warm p-3 shadow-[0_4px_0_var(--bd-line)]">
        {board.flatMap((row: unknown, rowIndex: number) =>
          (Array.isArray(row) ? row : [null, null, null]).map((cell: unknown, colIndex: number) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border-[1.5px] border-bd-line bg-white text-2xl font-black text-bd-ink shadow-[0_2px_0_var(--bd-line)]"
            >
              {typeof cell === 'string' || typeof cell === 'number' ? cell : ''}
            </div>
          ))
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Current Symbol: {data.currentSymbol || '-'}
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Winner: {data.winner || 'None'}
        </div>
      </div>
    </div>
  )
}
