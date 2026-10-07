'use client'

import { useState } from 'react'
import Modal from '@/components/Modal'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import {
  SKETCH_CUSTOM_WORDS_MIN,
  parseSketchCustomWords,
  readSketchCustomWordsSetting,
  writeSketchCustomWordsSetting,
  type SketchCustomWordsSetting,
} from '@/lib/sketch-custom-words'

export default function SketchCustomWords() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState<SketchCustomWordsSetting>(readSketchCustomWordsSetting)
  const [draft, setDraft] = useState<SketchCustomWordsSetting>(saved)
  const [isOpen, setIsOpen] = useState(false)

  const savedCount = parseSketchCustomWords(saved.text).length
  const isActive = savedCount >= SKETCH_CUSTOM_WORDS_MIN
  const draftCount = parseSketchCustomWords(draft.text).length
  const draftShort = draftCount > 0 && draftCount < SKETCH_CUSTOM_WORDS_MIN

  const open = () => {
    setDraft(saved)
    setIsOpen(true)
  }
  const save = () => {
    writeSketchCustomWordsSetting(draft)
    setSaved(draft)
    setIsOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="bd-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bd-bg2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:outline-hidden"
        data-testid="sketch-custom-words-row"
      >
        <Icon name="pencil" size={18} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-bd-ink">{t('games.guess_my_drawing.customWords.title')}</span>
          <span className="block truncate text-xs text-bd-ink-soft">
            {isActive
              ? t(saved.only ? 'games.guess_my_drawing.customWords.summaryOnly' : 'games.guess_my_drawing.customWords.summaryMixed', { count: savedCount })
              : t('games.guess_my_drawing.customWords.summaryOff')}
          </span>
        </span>
        <Icon name="arrow-right" size={16} tone="muted" />
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={t('games.guess_my_drawing.customWords.title')} maxWidth="md">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-bd-ink-soft">{t('games.guess_my_drawing.customWords.help', { min: SKETCH_CUSTOM_WORDS_MIN })}</p>
          <textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            rows={6}
            maxLength={20000}
            aria-label={t('games.guess_my_drawing.customWords.title')}
            placeholder={t('games.guess_my_drawing.customWords.placeholder')}
            className="w-full rounded-xl border p-3 text-sm text-bd-ink"
            style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)' }}
          />
          <p className={`text-xs ${draftShort ? 'text-(--bd-coral-deep)' : 'text-bd-ink-soft'}`} aria-live="polite">
            {draftShort
              ? t('games.guess_my_drawing.customWords.tooFew', { count: draftCount, min: SKETCH_CUSTOM_WORDS_MIN })
              : t('games.guess_my_drawing.customWords.count', { count: draftCount })}
          </p>
          <label className="flex items-center gap-2 text-sm text-bd-ink">
            <input type="checkbox" checked={draft.only} onChange={(e) => setDraft({ ...draft, only: e.target.checked })} />
            {t('games.guess_my_drawing.customWords.only')}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="bd-btn bd-btn-soft rounded-xl px-3 py-2 text-sm" onClick={() => setDraft({ text: '', only: false })}>
              {t('games.guess_my_drawing.customWords.clear')}
            </button>
            <button type="button" className="bd-btn bd-btn-primary rounded-xl px-3 py-2 text-sm font-semibold" onClick={save}>
              {t('games.guess_my_drawing.customWords.save')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
