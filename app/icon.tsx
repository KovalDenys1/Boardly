import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 32,
  height: 32,
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1F1B16',
          borderRadius: 8,
          boxShadow: '3px 3px 0 #FF6B5B',
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: '#FFC44D',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1,
            marginTop: -1,
          }}
        >
          B
        </span>
      </div>
    ),
    { ...size }
  )
}
