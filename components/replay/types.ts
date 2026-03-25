export interface ReplayRendererProps {
  snapshotState: unknown
  players: { userId: string }[]
  playerNameById: Map<string, string>
}
