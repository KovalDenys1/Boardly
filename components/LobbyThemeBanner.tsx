import type { LobbyTheme } from '@/lib/lobby-themes'
import { LOBBY_THEMES } from '@/lib/lobby-themes'

interface LobbyThemeBannerProps {
  theme: LobbyTheme
}

// Minimal banners for the existing 5 themes (no rich texture treatment)
function SimpleBanner({ theme }: { theme: LobbyTheme }) {
  const t = LOBBY_THEMES[theme]
  return (
    <div
      className="mb-2 -mx-4 sm:-mx-6 -mt-4 px-5 sm:px-6 py-2 flex items-center gap-2 text-xs font-semibold"
      style={{ background: t.bg, borderBottom: `3px solid ${t.accent}`, color: t.text }}
    >
      <span style={{ color: t.accent }}>●</span>
      {t.name} theme
    </div>
  )
}

function SakuraBanner() {
  const t = LOBBY_THEMES.sakura
  return (
    <div
      className="-mx-4 sm:-mx-6 -mt-4 mb-3"
      style={{
        height: 88,
        position: 'relative',
        background: 'linear-gradient(110deg, #FCEEF0 0%, #FBE1E6 55%, #F5D0D9 100%)',
        borderBottom: `3px solid ${t.accent}`,
        padding: '0 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        overflow: 'hidden',
      }}
    >
      {/* falling petal pattern */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.45,
        backgroundImage: [
          'radial-gradient(ellipse 6px 9px at 8% 22%, #E48AA0 0 60%, transparent 65%)',
          'radial-gradient(ellipse 5px 7px at 21% 68%, #F4A8B8 0 60%, transparent 65%)',
          'radial-gradient(ellipse 7px 10px at 38% 30%, #E48AA0 0 50%, transparent 60%)',
          'radial-gradient(ellipse 4px 6px at 55% 72%, #F4A8B8 0 60%, transparent 65%)',
          'radial-gradient(ellipse 6px 9px at 70% 18%, #E48AA0 0 55%, transparent 60%)',
          'radial-gradient(ellipse 5px 8px at 83% 60%, #F4A8B8 0 60%, transparent 65%)',
          'radial-gradient(ellipse 4px 6px at 93% 26%, #E48AA0 0 60%, transparent 65%)',
        ].join(', '),
        transform: 'rotate(-8deg) scale(1.1)',
      }} />
      {/* icon medallion */}
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: 'linear-gradient(150deg, #fff 0%, #FBE1E6 100%)',
        boxShadow: '0 4px 14px -6px rgba(228,138,160,0.5), inset 0 0 0 1px rgba(228,138,160,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, position: 'relative', zIndex: 1,
      }}>🌸</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 20, fontWeight: 600, color: t.text, letterSpacing: '-0.01em', lineHeight: 1 }}>
          Sakura
        </div>
        <div style={{ fontSize: 11, color: 'rgba(61,39,48,0.6)', marginTop: 4 }}>Spring · cherry blossom drift</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 3, height: 44, borderRadius: 3, background: 'linear-gradient(180deg, #E48AA0, #F4A8B8)' }} />
        <div style={{ fontSize: 10, color: 'rgba(61,39,48,0.5)', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
          mood<br /><span style={{ color: t.text, fontSize: 12, fontFamily: '"Fraunces", serif', fontWeight: 600 }}>tender</span>
        </div>
      </div>
    </div>
  )
}

function ArcticBanner() {
  const t = LOBBY_THEMES.arctic
  return (
    <div
      className="-mx-4 sm:-mx-6 -mt-4 mb-3"
      style={{
        height: 88,
        position: 'relative',
        background: 'linear-gradient(115deg, #F3F9FC 0%, #E2EFF7 50%, #CFE3EF 100%)',
        borderBottom: `3px solid ${t.accent}`,
        padding: '0 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        overflow: 'hidden',
      }}
    >
      {/* icy crystal grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: [
          'linear-gradient(60deg, transparent 49%, rgba(91,175,214,0.18) 49.5%, rgba(91,175,214,0.18) 50.5%, transparent 51%)',
          'linear-gradient(-60deg, transparent 49%, rgba(91,175,214,0.18) 49.5%, rgba(91,175,214,0.18) 50.5%, transparent 51%)',
        ].join(', '),
        backgroundSize: '34px 60px, 34px 60px',
        opacity: 0.6,
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at 80% 110%, rgba(255,255,255,0.7), transparent 55%)',
      }} />
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: 'linear-gradient(150deg, #fff, #DAEBF4)',
        boxShadow: '0 4px 14px -6px rgba(23,41,53,0.3), inset 0 0 0 1px rgba(91,175,214,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, color: t.accent, position: 'relative', zIndex: 1,
      }}>❄</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 20, fontWeight: 600, color: t.text, letterSpacing: '-0.01em', lineHeight: 1 }}>Arctic</div>
        <div style={{ fontSize: 11, color: 'rgba(23,41,53,0.55)', marginTop: 4 }}>Cold front · ice & still air</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 3, height: 44, borderRadius: 3, background: 'linear-gradient(180deg, #5BAFD6, #9FCEE3)' }} />
        <div style={{ fontSize: 10, color: 'rgba(23,41,53,0.5)', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
          mood<br /><span style={{ color: t.text, fontSize: 12, fontFamily: '"Fraunces", serif', fontWeight: 600 }}>focused</span>
        </div>
      </div>
    </div>
  )
}

function NeonCityBanner() {
  const t = LOBBY_THEMES.neon_city
  return (
    <div
      className="-mx-4 sm:-mx-6 -mt-4 mb-3"
      style={{
        height: 88,
        position: 'relative',
        background: 'linear-gradient(110deg, #0E0B1F 0%, #1B0F36 50%, #2B0A3D 100%)',
        borderBottom: `3px solid ${t.accent}`,
        padding: '0 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        overflow: 'hidden',
      }}
    >
      {/* perspective grid */}
      <div style={{
        position: 'absolute', inset: '40% 0 -20% 0', pointerEvents: 'none',
        backgroundImage: [
          'linear-gradient(90deg, transparent 49.5%, rgba(58,224,255,0.4) 50%, transparent 50.5%)',
          'linear-gradient(0deg, transparent 49.5%, rgba(255,63,164,0.3) 50%, transparent 50.5%)',
        ].join(', '),
        backgroundSize: '40px 100%, 100% 22px',
        transform: 'perspective(180px) rotateX(58deg)',
        transformOrigin: 'top',
        opacity: 0.85,
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 60%, transparent 100%)',
      }} />
      {/* glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at 90% 20%, rgba(255,63,164,0.5), transparent 38%), radial-gradient(circle at 10% 100%, rgba(58,224,255,0.35), transparent 40%)',
      }} />
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: 'linear-gradient(140deg, #2B0A3D, #1B0F36)',
        boxShadow: '0 0 0 1px #FF3FA4, 0 0 20px rgba(255,63,164,0.55), inset 0 0 14px rgba(255,63,164,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, color: t.accent, position: 'relative', zIndex: 1,
        textShadow: '0 0 10px rgba(255,63,164,0.9)',
      }}>⚡</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 20, fontWeight: 600, color: t.text, letterSpacing: '-0.01em', lineHeight: 1, textShadow: '0 0 12px rgba(58,224,255,0.4)' }}>
          Neon City
        </div>
        <div style={{ fontSize: 11, color: 'rgba(240,233,255,0.55)', marginTop: 4, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}>
          04:21 · sector 7
        </div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 3, height: 44, borderRadius: 3, background: 'linear-gradient(180deg, #FF3FA4, #3AE0FF)', boxShadow: '0 0 10px rgba(255,63,164,0.6)' }} />
        <div style={{ fontSize: 10, color: 'rgba(240,233,255,0.5)', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
          mood<br /><span style={{ color: '#3AE0FF', fontSize: 12, fontFamily: '"Fraunces", serif', fontWeight: 600 }}>electric</span>
        </div>
      </div>
    </div>
  )
}

function VintageBanner() {
  const t = LOBBY_THEMES.vintage
  return (
    <div
      className="-mx-4 sm:-mx-6 -mt-4 mb-3"
      style={{
        height: 88,
        position: 'relative',
        background: 'linear-gradient(108deg, #F4EAD1 0%, #EFDFBC 60%, #E6CFA0 100%)',
        borderBottom: `3px solid ${t.accent}`,
        padding: '0 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 50px rgba(156,91,46,0.14)',
      }}
    >
      {/* paper grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        backgroundImage: [
          'radial-gradient(circle at 1px 1px, rgba(58,42,26,0.18) 1px, transparent 1.5px)',
          'radial-gradient(circle at 1px 1px, rgba(58,42,26,0.10) 1px, transparent 1.5px)',
        ].join(', '),
        backgroundSize: '7px 7px, 13px 11px',
        backgroundPosition: '0 0, 3px 5px',
      }} />
      {/* decorative inner border */}
      <div style={{ position: 'absolute', inset: 6, pointerEvents: 'none', border: '1px solid rgba(156,91,46,0.35)', borderRadius: 4 }} />
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: 'radial-gradient(circle at 35% 30%, #F8EDD2, #D6BE94 70%, #9C5B2E)',
        boxShadow: 'inset 0 0 0 2px rgba(58,42,26,0.4), 0 3px 8px -4px rgba(58,42,26,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Fraunces", Georgia, serif', fontSize: 22, fontWeight: 700, color: t.text, fontStyle: 'italic',
        position: 'relative', zIndex: 1,
      }}>B</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 20, fontWeight: 600, color: t.text, fontStyle: 'italic', lineHeight: 1 }}>
          Vintage
        </div>
        <div style={{ fontSize: 10, color: 'rgba(58,42,26,0.55)', marginTop: 4, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          · Est. 1907 · Parlor Series ·
        </div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 3, height: 44, borderRadius: 3, background: 'repeating-linear-gradient(180deg, #9C5B2E 0 6px, #D6BE94 6px 10px)' }} />
        <div style={{ fontSize: 10, color: 'rgba(58,42,26,0.5)', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
          mood<br /><span style={{ color: t.text, fontSize: 12, fontFamily: '"Fraunces", serif', fontWeight: 600, fontStyle: 'italic' }}>genteel</span>
        </div>
      </div>
    </div>
  )
}

const RICH_BANNER_THEMES = new Set<LobbyTheme>(['sakura', 'arctic', 'neon_city', 'vintage'])

export default function LobbyThemeBanner({ theme }: LobbyThemeBannerProps) {
  if (theme === 'sakura') return <SakuraBanner />
  if (theme === 'arctic') return <ArcticBanner />
  if (theme === 'neon_city') return <NeonCityBanner />
  if (theme === 'vintage') return <VintageBanner />
  if (!RICH_BANNER_THEMES.has(theme)) return <SimpleBanner theme={theme} />
  return null
}

export { RICH_BANNER_THEMES }
