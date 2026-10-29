import type { ReactNode } from 'react'

/**
 * Yahtzee on the shared desktop game grid (#1363): the header across the first
 * row, the status banner directly above the board, events and chat in the right
 * column – the same places as in every other game.
 */
export default function YahtzeeDesktopLayout({
  header,
  status,
  board,
  events,
  chat,
}: {
  header: ReactNode
  status: ReactNode
  board: ReactNode
  events: ReactNode
  chat: ReactNode
}) {
  return (
    <div className="ttt-desktop-layout">
      <div className="ttt-grid">
        {header}
        <div className="ttt-center-col">
          {status}
          {board}
        </div>
        <div className="ttt-right-col yz-right-col">
          {events}
          {chat}
        </div>
      </div>
    </div>
  )
}
