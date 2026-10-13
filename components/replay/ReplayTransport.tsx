'use client'

import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'

export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const

interface ReplayTransportProps {
  index: number
  count: number
  playing: boolean
  speed: number
  caption: string
  onSeek: (index: number) => void
  onTogglePlay: () => void
  onCycleSpeed: () => void
}

const buttonClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-bd-line bg-bd-bg text-bd-ink transition-colors hover:bg-bd-bg2 disabled:opacity-40 disabled:hover:bg-bd-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50'

export default function ReplayTransport({ index, count, playing, speed, caption, onSeek, onTogglePlay, onCycleSpeed }: ReplayTransportProps) {
  const { t } = useTranslation()
  const last = Math.max(0, count - 1)

  return (
    <div className="replay-transport flex shrink-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} onClick={() => onSeek(0)} disabled={index === 0} aria-label={t('profile.gameReplay.first')}>
          <Icon name="skip-back" size={18} />
        </button>
        <button type="button" className={buttonClass} onClick={() => onSeek(index - 1)} disabled={index === 0} aria-label={t('profile.gameReplay.stepBack')}>
          <Icon name="arrow-left" size={18} />
        </button>
        <button
          type="button"
          className={`${buttonClass} bg-bd-ink text-bd-bg hover:bg-bd-ink`}
          onClick={onTogglePlay}
          disabled={count < 2}
          aria-label={playing ? t('profile.gameReplay.pause') : t('profile.gameReplay.play')}
          aria-pressed={playing}
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button type="button" className={buttonClass} onClick={() => onSeek(index + 1)} disabled={index >= last} aria-label={t('profile.gameReplay.stepForward')}>
          <Icon name="arrow-right" size={18} />
        </button>
        <button type="button" className={buttonClass} onClick={() => onSeek(last)} disabled={index >= last} aria-label={t('profile.gameReplay.last')}>
          <Icon name="skip-forward" size={18} />
        </button>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-(--bd-ink)"
          aria-label={t('profile.gameReplay.timeline')}
          aria-valuetext={caption}
        />
        <button
          type="button"
          className={`${buttonClass} w-auto px-3 font-mono text-xs font-bold`}
          onClick={onCycleSpeed}
          aria-label={t('profile.gameReplay.speed')}
        >
          {speed}×
        </button>
      </div>
      <p className="text-center font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bd-ink-muted">
        {t('profile.gameReplay.stepCounter', { current: index + 1, total: count })}
      </p>
    </div>
  )
}
