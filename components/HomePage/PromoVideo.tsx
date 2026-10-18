'use client'

import { useRef, useState } from 'react'
import Icon from '@/components/icons/Icon'
import { useTranslation } from '@/lib/i18n-helpers'
import { promoVideoFor } from '@/lib/promo-video'

export default function PromoVideo() {
  const { t, i18n } = useTranslation()
  const video = promoVideoFor(i18n.language)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)

  return (
    <section className="home-section home-section-video" aria-labelledby="home-promo-video-title">
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--bd-ink-soft)',
          }}
        >
          {t('home.promoVideo.kicker')}
        </span>
        <h2
          id="home-promo-video-title"
          style={{
            fontFamily: 'var(--bd-font-display)',
            fontSize: 36,
            fontWeight: 700,
            color: 'var(--bd-ink)',
            marginTop: 8,
            letterSpacing: 0,
          }}
        >
          {t('home.promoVideo.title')}
        </h2>
      </div>

      <div className="home-video-frame">
        <video
          ref={videoRef}
          src={video.src}
          poster={video.poster}
          preload="none"
          controls={started}
          playsInline
          aria-label={t('home.promoVideo.label')}
          onPlay={() => setStarted(true)}
        />
        {!started && (
          <button
            type="button"
            className="home-video-play"
            onClick={() => {
              setStarted(true)
              void videoRef.current?.play()
            }}
          >
            <Icon name="play" size={18} />
            {t('home.promoVideo.play')}
          </button>
        )}
      </div>
    </section>
  )
}
