import type { ReactNode } from 'react'

/**
 * Yahtzee on the shared desktop game grid (#1363): scoreboard and room card on
 * the first row, the status banner directly above the board, events and chat
 * in the right column – the same places as in every other game.
 */
export default function YahtzeeDesktopLayout({
  header,
  room,
  status,
  board,
  events,
  chat,
}: {
  header: ReactNode
  room: ReactNode
  status: ReactNode
  board: ReactNode
  events: ReactNode
  chat: ReactNode | null
}) {
  return (
    <div className="ttt-desktop-layout">
      <div className="ttt-grid">
        {header}
        {room}
        <div className="ttt-center-col">
          {status}
          {board}
        </div>
        <div className="ttt-right-col">
          {events}
          {chat}
        </div>
      </div>
    </div>
  )
}
