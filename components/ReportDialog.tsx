'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { Icon } from '@/components/icons'
import { fetchWithGuest } from '@/lib/client/fetch-with-guest'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import {
  REPORT_NOTE_MAX_CHARS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
} from '@/lib/content-reports'

/**
 * The report form (#1172): what is being reported (when there is a choice), why, and
 * an optional note. It posts to /api/reports with the guest token when there is one,
 * so a guest reports exactly as a signed-in player does.
 *
 * `ReportForm` is the body alone, for a menu that already is a dialog
 * (PlayerProfileCard drills down into it); `ReportDialog` wraps it in a Modal for the
 * places that have none (a chat message, the public profile).
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'sent' }
  | { kind: 'duplicate' }
  | { kind: 'error'; messageKey: TranslationKeys }

export interface ReportFormProps {
  /** What can be reported here. With more than one, the reporter picks. */
  targets: ReportTarget[]
  /** The reported message, shown back to the reporter so they know what they are reporting. */
  quote?: string
  onDone: () => void
  /** Shown instead of Cancel when the form is a step inside another menu. */
  onBack?: () => void
  /**
   * Move focus to the form's heading when it appears. For a menu that swaps its own
   * content for the form, where focus would otherwise stay on a button that is gone.
   */
  focusHeadingOnMount?: boolean
}

async function submitReport(target: ReportTarget, reason: ReportReason, note: string): Promise<SubmitState> {
  const response = await fetchWithGuest('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...target, reason, ...(note ? { note } : {}) }),
  })
  const payload = (await response.json().catch(() => null)) as { duplicate?: boolean; code?: string } | null

  if (response.ok) return payload?.duplicate ? { kind: 'duplicate' } : { kind: 'sent' }
  if (response.status === 401) return { kind: 'error', messageKey: 'report.errors.signIn' }
  if (response.status === 429) return { kind: 'error', messageKey: 'report.errors.rateLimited' }
  if (response.status === 404) return { kind: 'error', messageKey: 'report.errors.notFound' }
  if (payload?.code === 'CANNOT_REPORT_SELF') return { kind: 'error', messageKey: 'report.errors.self' }
  return { kind: 'error', messageKey: 'report.errors.generic' }
}

export function ReportForm({ targets, quote, onDone, onBack, focusHeadingOnMount = false }: ReportFormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const [targetIndex, setTargetIndex] = useState(0)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState<SubmitState>({ kind: 'idle' })

  const target = targets[targetIndex] ?? targets[0]
  const submitting = state.kind === 'submitting'
  const done = state.kind === 'sent' || state.kind === 'duplicate'

  useEffect(() => {
    if (focusHeadingOnMount) headingRef.current?.focus()
  }, [focusHeadingOnMount])

  // The submit button the reporter was on is gone once the report is in: focus the
  // result, so a screen reader reads it and the keyboard lands on this dialog.
  useEffect(() => {
    if (done) resultRef.current?.focus()
  }, [done])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!target || !reason || submitting) return
    setState({ kind: 'submitting' })
    try {
      setState(await submitReport(target, reason, note.trim()))
    } catch {
      setState({ kind: 'error', messageKey: 'report.errors.generic' })
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center" role="status" aria-live="polite">
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-mint"
          aria-hidden="true"
        >
          <Icon name="check" size={24} tone="on-accent" />
        </div>
        <p ref={resultRef} tabIndex={-1} className="text-base font-bold text-bd-ink focus:outline-hidden">
          {t('report.successTitle')}
        </p>
        <p className="text-sm text-bd-ink-soft">
          {state.kind === 'duplicate' ? t('report.duplicate') : t('report.successBody')}
        </p>
        <button type="button" onClick={onDone} className="bd-btn bd-btn-primary w-full justify-center">
          {t('report.close')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby={`${formId}-title`}>
      <h2
        ref={headingRef}
        id={`${formId}-title`}
        tabIndex={-1}
        className="flex items-center gap-2 text-base font-bold text-bd-ink focus:outline-hidden"
      >
        <Icon name="flag" size={18} tone="coral" />
        {t('report.title')}
      </h2>

      {quote && (
        <figure className="rounded-xl border border-bd-line bg-bd-bg2 px-3 py-2">
          <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-bd-ink-muted">
            {t('report.quoted')}
          </figcaption>
          <blockquote className="mt-1 line-clamp-3 whitespace-pre-wrap wrap-break-word text-sm text-bd-ink">{quote}</blockquote>
        </figure>
      )}

      {targets.length > 1 && (
        <fieldset className="stack-y-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-bd-ink">{t('report.targetLabel')}</legend>
          {targets.map((option, index) => (
            <label
              key={option.targetType}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-bd-line px-3 py-2 text-sm text-bd-ink has-checked:border-bd-ink has-checked:bg-bd-bg2"
            >
              <input
                type="radio"
                name={`${formId}-target`}
                value={option.targetType}
                checked={index === targetIndex}
                onChange={() => setTargetIndex(index)}
              />
              {t(`report.targets.${option.targetType}` as TranslationKeys)}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="stack-y-1.5">
        <legend className="mb-1.5 text-sm font-semibold text-bd-ink">{t('report.reasonLabel')}</legend>
        {REPORT_REASONS.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-bd-line px-3 py-2 text-sm text-bd-ink has-checked:border-bd-ink has-checked:bg-bd-bg2"
          >
            <input
              type="radio"
              name={`${formId}-reason`}
              value={option}
              checked={reason === option}
              onChange={() => setReason(option)}
            />
            {t(`report.reasons.${option}` as TranslationKeys)}
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor={`${formId}-note`} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-bd-ink">
          <span>{t('report.noteLabel')}</span>
          <span className="text-xs font-normal text-bd-ink-muted">{t('report.noteOptional')}</span>
        </label>
        <textarea
          id={`${formId}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={REPORT_NOTE_MAX_CHARS}
          rows={3}
          placeholder={t('report.notePlaceholder')}
          className="bd-input resize-none text-sm"
        />
        <div className="mt-1 text-right text-[11px] text-bd-ink-muted" aria-hidden="true">
          {note.length}/{REPORT_NOTE_MAX_CHARS}
        </div>
      </div>

      {state.kind === 'error' && (
        <p role="alert" className="rounded-xl border border-bd-danger-border bg-bd-danger-bg px-3 py-2 text-sm text-bd-danger-text">
          {t(state.messageKey)}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack ?? onDone}
          className="bd-btn bd-btn-soft flex-1 justify-center"
          disabled={submitting}
        >
          {onBack ? t('report.back') : t('report.cancel')}
        </button>
        <button
          type="submit"
          disabled={!reason || submitting}
          className="bd-btn bd-btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none!"
        >
          {submitting ? t('report.submitting') : t('report.submit')}
        </button>
      </div>
    </form>
  )
}

export interface ReportDialogProps extends Omit<ReportFormProps, 'onDone' | 'onBack'> {
  isOpen: boolean
  onClose: () => void
}

export default function ReportDialog({ isOpen, onClose, targets, quote }: ReportDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="p-5">
        {/* Mounted only while open, so the next report starts from a fresh form. */}
        {isOpen && targets.length > 0 && (
          <ReportForm targets={targets} quote={quote} onDone={onClose} />
        )}
      </div>
    </Modal>
  )
}
