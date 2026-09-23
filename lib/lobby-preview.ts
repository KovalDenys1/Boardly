import { prisma } from './db'
import { getGameMetadata } from './game-catalog'

/**
 * What a shared invite link (`/lobby/<code>`) shows in WhatsApp, Discord, Messenger
 * or iMessage (#1091). One lookup feeds both the page's `<head>` and its preview
 * image, so they agree on what they say. They can still disagree on *when*: the head
 * is rendered per request while the image is CDN-cached (`s-maxage=60`, up to five
 * minutes stale), so the card's seat count can trail the title's by a few minutes.
 *
 * It names the game and the seat count and nothing about the people in it. The
 * card used to read "Join <username>'s Yahtzee lobby", and for a Google sign-up the
 * username is often a real name – shown to anyone the link is forwarded to, and
 * to every chat app's crawler. "Join my game of Yahtzee" says the same thing from
 * the sharer's side, and the sharer is not always the host anyway.
 */

export type LobbyPreview =
  | { found: false }
  | { found: true; gameName: string; accentColor: string | null; players: number; maxPlayers: number }

export async function getLobbyPreview(code: string): Promise<LobbyPreview> {
  try {
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        gameType: true,
        isActive: true,
        maxPlayers: true,
        games: {
          where: { status: 'waiting' },
          select: { _count: { select: { players: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!lobby || !lobby.isActive) return { found: false }

    const meta = getGameMetadata(lobby.gameType)
    return {
      found: true,
      gameName: meta?.name ?? 'a board game',
      accentColor: meta?.accentColor ?? null,
      players: lobby.games[0]?._count?.players ?? 0,
      maxPlayers: lobby.maxPlayers,
    }
  } catch {
    return { found: false }
  }
}

export function lobbyPreviewText(preview: LobbyPreview): { title: string; description: string } {
  if (!preview.found) {
    return {
      title: 'Join a game on Boardly',
      description: 'Free online board games with friends. Tap to join – no download, no signup.',
    }
  }
  return {
    title: `Join my game of ${preview.gameName} on Boardly`,
    description: `${preview.players}/${preview.maxPlayers} players in the lobby. Tap to join – free, in your browser, no signup.`,
  }
}
