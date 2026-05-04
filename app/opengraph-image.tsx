import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Boardly — Play Board Games Online with Friends'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
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
        {/* Dot grid background */}
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

        {/* Main card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
            zIndex: 1,
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              background: '#1F1B16',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '6px 6px 0 #FF6B5B',
              marginBottom: 36,
            }}
          >
            <span style={{ fontSize: 60, fontWeight: 900, color: '#FFC44D', lineHeight: 1 }}>B</span>
          </div>

          {/* Wordmark */}
          <div
            style={{
              fontSize: 88,
              fontWeight: 900,
              color: '#1F1B16',
              letterSpacing: '-4px',
              lineHeight: 1,
              marginBottom: 20,
            }}
          >
            boardly
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 32,
              color: '#4A3F33',
              textAlign: 'center',
              maxWidth: 700,
              lineHeight: 1.4,
              marginBottom: 48,
            }}
          >
            Play board games online with friends — free, no download needed.
          </div>

          {/* Chips */}
          <div style={{ display: 'flex', gap: 16 }}>
            {['Yahtzee', 'Guess the Spy', 'Memory', 'Tic-Tac-Toe'].map((name) => (
              <div
                key={name}
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#1F1B16',
                  background: '#F2E9D8',
                  padding: '10px 22px',
                  borderRadius: 999,
                  border: '1.5px solid #1F1B1620',
                }}
              >
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom URL */}
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
    { ...size }
  )
}
