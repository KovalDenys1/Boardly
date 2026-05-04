import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getGameMetadata } from '@/lib/game-catalog'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  let gameName = 'Board Game'
  let hostName = 'Host'
  let playerCount = 0
  let maxPlayers = 4
  let found = false

  try {
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        gameType: true,
        maxPlayers: true,
        isActive: true,
        creator: { select: { username: true } },
        games: {
          where: { status: 'waiting' },
          select: { _count: { select: { players: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (lobby && lobby.isActive) {
      found = true
      const meta = getGameMetadata(lobby.gameType)
      if (meta) {
        gameName = meta.name
      }
      hostName = lobby.creator?.username || 'Host'
      maxPlayers = lobby.maxPlayers
      playerCount = lobby.games[0]?._count?.players ?? 0
    }
  } catch {
    // fallback to generic card
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: '#FBF6EE',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, #1F1B1618 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, borderRadius: '50%', background: '#FF6B5B22', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 280, height: 280, borderRadius: '50%', background: '#FFC44D22', display: 'flex' }} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
            zIndex: 1,
            padding: '0 80px',
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: '#1F1B16',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '5px 5px 0 #FF6B5B',
              marginBottom: 32,
            }}
          >
            <span style={{ fontSize: 48, fontWeight: 900, color: '#FFC44D', lineHeight: 1 }}>B</span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: 68,
              fontWeight: 900,
              color: '#1F1B16',
              textAlign: 'center',
              letterSpacing: '-2px',
              lineHeight: 1.1,
              marginBottom: 20,
            }}
          >
            {found ? `Join ${gameName}` : 'Join a Game'}
          </div>

          {/* Sub-info */}
          {found ? (
            <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 26,
                  color: '#1F1B16',
                  background: '#F2E9D8',
                  padding: '12px 28px',
                  borderRadius: 999,
                  border: '1.5px solid #1F1B1620',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 600,
                }}
              >
                {hostName}&apos;s room
              </div>
              <div
                style={{
                  fontSize: 26,
                  color: '#1F1B16',
                  background: '#F2E9D8',
                  padding: '12px 28px',
                  borderRadius: 999,
                  border: '1.5px solid #1F1B1620',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 600,
                }}
              >
                {playerCount}/{maxPlayers} players
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 32,
                color: '#4A3F33',
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              Play board games online with friends
            </div>
          )}
        </div>

        {/* Bottom branding */}
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            fontSize: 22,
            fontWeight: 600,
            color: '#8A7A66',
          }}
        >
          boardly.online
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
