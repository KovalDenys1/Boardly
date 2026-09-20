import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 32,
  height: 32,
}

export const contentType = 'image/png'

/**
 * The browser-tab icon (#1030).
 *
 * This used to be a single div at 100% x 100% carrying `boxShadow: 3px 3px 0`.
 * A box shadow is painted outside the element, and the element already filled
 * the canvas, so the coral was clipped away entirely and the tab showed a bare
 * dark square. The mark is drawn as two stacked layers instead, and the pair is
 * inset so both fit: tile 24px, shadow offset 2px, union 26px, centred in 32.
 *
 * The proportions are assets/brand/tile.svg scaled to 32 (lift 26/512, radius
 * 101/380, letter 274/380). Keep them in step.
 */
export default function Icon() {
  const TILE = 24
  const LIFT = 2
  const ORIGIN = (size.width - (TILE + LIFT)) / 2

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: ORIGIN + LIFT,
            top: ORIGIN + LIFT,
            width: TILE,
            height: TILE,
            borderRadius: 6,
            background: '#FF6B5B',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: ORIGIN,
            top: ORIGIN,
            width: TILE,
            height: TILE,
            borderRadius: 6,
            background: '#1F1B16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 17,
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
      </div>
    ),
    { ...size }
  )
}
