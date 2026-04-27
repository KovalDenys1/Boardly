import Die from '@/components/ui/Die'

export default function HeroBoard() {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        maxWidth: 480,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* main playing surface */}
      <div
        style={{
          position: 'absolute',
          inset: '8%',
          background: '#4FC9A6',
          border: '4px solid #1F1B16',
          borderRadius: 32,
          boxShadow: '10px 10px 0 #1F1B16',
          transform: 'rotate(-3deg)',
          overflow: 'hidden',
          backgroundImage: 'radial-gradient(rgba(31,27,22,0.12) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 24,
            background: 'rgba(255,255,255,0.18)',
            borderRadius: 18,
            border: '2px dashed rgba(31,27,22,0.3)',
          }}
        />
      </div>

      {/* dice cluster */}
      <div
        className="bd-float"
        style={{ position: 'absolute', top: '12%', left: '28%', animationDelay: '0s' }}
      >
        <Die value={6} size={70} rotate="-12deg" />
      </div>
      <div
        className="bd-float"
        style={{ position: 'absolute', top: '24%', left: '52%', animationDelay: '0.6s' }}
      >
        <Die value={4} size={56} rotate="8deg" />
      </div>
      <div
        className="bd-float"
        style={{ position: 'absolute', top: '44%', left: '18%', animationDelay: '1.2s' }}
      >
        <Die value={2} size={62} rotate="4deg" />
      </div>

      {/* card */}
      <div
        className="bd-float"
        style={{
          position: 'absolute',
          bottom: '14%',
          right: '14%',
          width: 90,
          height: 130,
          background: '#FF6B5B',
          border: '3px solid #1F1B16',
          borderRadius: 14,
          boxShadow: '4px 4px 0 #1F1B16',
          transform: 'rotate(8deg)',
          display: 'grid',
          placeItems: 'center',
          color: 'white',
          fontFamily: "'Bricolage Grotesque', Georgia, serif",
          fontSize: 40,
          animationDelay: '0.8s',
        }}
      >
        ♠
      </div>

      {/* chess piece */}
      <div
        className="bd-float"
        style={{
          position: 'absolute',
          bottom: '18%',
          left: '18%',
          width: 50,
          height: 90,
          background: '#1F1B16',
          borderRadius: '24px 24px 4px 4px',
          animationDelay: '1.4s',
        }}
      />

      {/* YAHTZEE! sticker */}
      <div
        className="bd-float"
        style={{
          position: 'absolute',
          top: '4%',
          right: '4%',
          transform: 'rotate(12deg)',
          background: '#FFC44D',
          color: '#1F1B16',
          border: '2px solid #1F1B16',
          boxShadow: '2px 2px 0 #1F1B16',
          borderRadius: 999,
          padding: '6px 14px',
          fontFamily: "'Bricolage Grotesque', Georgia, serif",
          fontWeight: 700,
          fontSize: 14,
          animationDelay: '0.3s',
        }}
      >
        YAHTZEE!
      </div>

      {/* squiggle */}
      <svg
        style={{ position: 'absolute', bottom: '2%', left: '40%', width: 80, height: 40 }}
        viewBox="0 0 80 40"
      >
        <path
          d="M2 20 Q 12 5, 22 20 T 42 20 T 62 20 T 78 20"
          stroke="#7867E8"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
