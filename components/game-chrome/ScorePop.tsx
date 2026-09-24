'use client'

import React, { useRef } from 'react'

/**
 * Score-change pop for scoreboard centres (#1111).
 *
 * Renders a `<div>` keyed on `value`, so a new score mounts a fresh node and
 * `.score-pop` (app/globals.css: a transform-only scale bounce with the motion
 * tokens) plays once. The first value never pops: a page load or a reconnect
 * is not a score change. Everything else (style, children) passes through, so
 * adopting it is swapping the score's `<div>` for `<ScorePop value={…}>`.
 *
 * Usable after a page's early returns: it is a component, not a hook.
 */
export interface ScorePopProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whatever identifies the score – `${left}:${right}` for a scoreboard. */
  value: string | number
}

/** Class name for adopters that key an element themselves. */
export const SCORE_POP_CLASS = 'score-pop'

export default function ScorePop({ value, className, children, ...rest }: ScorePopProps) {
  const firstValueRef = useRef(value)
  const hasChangedRef = useRef(false)
  if (value !== firstValueRef.current) hasChangedRef.current = true

  const classes = [hasChangedRef.current ? SCORE_POP_CLASS : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div key={String(value)} className={classes || undefined} data-score-value={String(value)} {...rest}>
      {children}
    </div>
  )
}
