'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { playCue } from '@/lib/sound-engine'
import { Icon } from '@/components/icons'

/** die.hold is pitched +4 st for a hold; a release sits at +1 st, a lower step for letting go. */
const RELEASE_SEMIS = -3

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const PLACEHOLDER_PIPS = PIPS[5]
const MAX_ROLLS = 3

function DieButton({
  index,
  value,
  held,
  placeholder,
  disabled,
  rolling,
  onToggle,
}: {
  index: number
  value: number
  held: boolean
  placeholder: boolean
  disabled: boolean
  rolling: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const [landed, setLanded] = React.useState(false)
  const previousValue = React.useRef(value)
  React.useEffect(() => {
    if (previousValue.current === value) return
    previousValue.current = value
    if (!placeholder) setLanded(true)
    // Only a new value lands; the placeholder flag changing alone does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const pips = placeholder ? PLACEHOLDER_PIPS : PIPS[value] ?? []
  const className = [
    'yz-die',
    held && !placeholder ? 'yz-die--held' : '',
    placeholder ? 'yz-die--placeholder' : '',
    rolling && !held ? 'yz-die--rolling' : '',
    landed && !rolling && !placeholder ? 'yz-die--landed' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={className}
      style={{ '--i': index } as React.CSSProperties}
      disabled={disabled}
      aria-pressed={held}
      aria-label={placeholder ? t('yahtzee.ui.dieBlankAria') : t(held ? 'yahtzee.ui.dieHeldAria' : 'yahtzee.ui.dieAria', { value })}
      onClick={() => {
        playCue('die.hold', { semis: held ? RELEASE_SEMIS : 0 })
        onToggle()
      }}
    >
      <span
        className="yz-die__face"
        aria-hidden
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === 'yz-land') setLanded(false)
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className={`yz-die__pip${pips.includes(i) ? ' yz-die__pip--on' : ''}`} />
        ))}
      </span>
      <span className="yz-die__held" aria-hidden>{t('yahtzee.ui.heldLabel')}</span>
    </button>
  )
}

export default function YahtzeeDiceBar({
  dice,
  held,
  rollsLeft,
  placeholder,
  isRolling,
  canHold,
  canRoll,
  onToggleHold,
  onRoll,
  showRollButton = true,
  hint = null,
}: {
  dice: readonly number[]
  held: readonly boolean[]
  rollsLeft: number
  placeholder: boolean
  isRolling: boolean
  canHold: boolean
  canRoll: boolean
  onToggleHold: (index: number) => void
  onRoll: () => void
  showRollButton?: boolean
  hint?: string | null
}) {
  const { t } = useTranslation()
  const left = Math.max(0, Math.min(MAX_ROLLS, rollsLeft))

  return (
    <div className={`yz-tray${showRollButton ? '' : ' yz-tray--no-roll'}`}>
      <div className="yz-tray__body">
        <div className="yz-tray__dice">
          {dice.map((value, index) => (
            <DieButton
              key={index}
              index={index}
              value={value}
              held={!!held[index]}
              placeholder={placeholder}
              disabled={!canHold}
              rolling={isRolling}
              onToggle={() => onToggleHold(index)}
            />
          ))}
        </div>
        {showRollButton && (
          <button
            type="button"
            className={`yz-roll${isRolling ? ' yz-roll--rolling' : ''}`}
            disabled={!canRoll}
            aria-label={`${t('yahtzee.ui.rollDice')}. ${t('yahtzee.ui.rollsLeftCount', { count: left })}`}
            onClick={onRoll}
          >
            <span className="yz-roll__icon" aria-hidden><Icon name="dice" size={18} /></span>
            <span className="yz-roll__label">{t('yahtzee.ui.rollDice')}</span>
            <span className="yz-roll__pips" aria-hidden>
              {Array.from({ length: MAX_ROLLS }).map((_, i) => (
                <span key={i} className={`yz-roll__pip${i < left ? ' yz-roll__pip--left' : ''}`} />
              ))}
            </span>
          </button>
        )}
      </div>
      {hint && <p className="yz-tray__hint" role="status">{hint}</p>}
    </div>
  )
}
