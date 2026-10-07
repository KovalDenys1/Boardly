'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import type { SketchAndGuessRound } from '@/lib/games/sketch-and-guess-game'
import type { TranslationKeys } from '@/lib/i18n-helpers'

interface GalleryStroke {
  color: string
  width: number
  points: Array<{ x: number; y: number }>
}

interface GalleryDrawing {
  width: number
  height: number
  strokes: GalleryStroke[]
}

export interface SketchGalleryEntry {
  round: number
  word: string
  drawerName: string
  hidden: boolean
  drawing: GalleryDrawing | null
}

type TFn = (key: TranslationKeys, options?: string | Record<string, unknown>) => string

const THUMB_SIZE = 240
const IMAGE_COLUMNS = 3
const IMAGE_TILE = 320
const IMAGE_CAPTION = 56
const IMAGE_GAP = 16
const IMAGE_HEADER = 72

export function parseGalleryDrawing(content: string | null | undefined): GalleryDrawing | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as Partial<GalleryDrawing> & { type?: unknown; hidden?: unknown; autoSubmitted?: unknown }
    // The timeout stand-in is a grey mark, not a drawing anyone made.
    if (parsed.type !== 'drawing' || parsed.hidden === true || parsed.autoSubmitted === true || !Array.isArray(parsed.strokes)) return null
    if (parsed.strokes.length === 0) return null
    return {
      width: typeof parsed.width === 'number' && parsed.width > 0 ? parsed.width : 480,
      height: typeof parsed.height === 'number' && parsed.height > 0 ? parsed.height : 480,
      strokes: parsed.strokes,
    }
  } catch {
    return null
  }
}

export function buildSketchGalleryEntries(
  rounds: SketchAndGuessRound[],
  wordOf: (round: SketchAndGuessRound) => string,
  nameOf: (id: string) => string,
): SketchGalleryEntry[] {
  return [...rounds]
    .sort((a, b) => a.round - b.round)
    .map((round) => ({
      round: round.round,
      word: wordOf(round),
      drawerName: nameOf(round.drawerId),
      hidden: round.drawingHiddenByHost === true,
      drawing: round.drawingHiddenByHost ? null : parseGalleryDrawing(round.drawingContent),
    }))
}

function paintDrawing(ctx: CanvasRenderingContext2D, drawing: GalleryDrawing, x: number, y: number, size: number) {
  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x, y, size, size)
  ctx.beginPath()
  ctx.rect(x, y, size, size)
  ctx.clip()
  const scale = size / Math.max(drawing.width, drawing.height)
  for (const stroke of drawing.strokes) {
    if (!Array.isArray(stroke.points) || stroke.points.length === 0) continue
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = Math.max(1, stroke.width * scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x + stroke.points[0].x * scale, y + stroke.points[0].y * scale)
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(x + stroke.points[i].x * scale, y + stroke.points[i].y * scale)
    }
    // A single tap is a dot, which a zero-length path does not paint.
    if (stroke.points.length === 1) ctx.lineTo(x + stroke.points[0].x * scale + 0.01, y + stroke.points[0].y * scale)
    ctx.stroke()
  }
  ctx.restore()
}

function DrawingThumb({ drawing }: { drawing: GalleryDrawing }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = THUMB_SIZE * dpr
    canvas.height = THUMB_SIZE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintDrawing(ctx, drawing, 0, 0, THUMB_SIZE)
  }, [drawing])
  return <canvas ref={ref} className="sketch-gallery__canvas" aria-hidden="true" />
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Every round's drawing on one PNG, captioned, for the player to keep or send. */
export async function renderSketchGalleryImage(
  entries: SketchGalleryEntry[],
  labels: { title: string; footer: string; byLine: (name: string) => string; hidden: string; noDrawing: string },
): Promise<Blob | null> {
  const { title, footer, byLine } = labels
  const columns = Math.min(IMAGE_COLUMNS, Math.max(1, entries.length))
  const rows = Math.ceil(entries.length / columns)
  const width = IMAGE_GAP + columns * (IMAGE_TILE + IMAGE_GAP)
  const height = IMAGE_HEADER + rows * (IMAGE_TILE + IMAGE_CAPTION + IMAGE_GAP) + 40
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#FFF8EC'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#1F1B16'
  ctx.font = '700 28px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(fitText(ctx, title, width - 2 * IMAGE_GAP), IMAGE_GAP, IMAGE_HEADER / 2)

  entries.forEach((entry, index) => {
    const x = IMAGE_GAP + (index % columns) * (IMAGE_TILE + IMAGE_GAP)
    const y = IMAGE_HEADER + Math.floor(index / columns) * (IMAGE_TILE + IMAGE_CAPTION + IMAGE_GAP)
    if (entry.drawing) {
      paintDrawing(ctx, entry.drawing, x, y, IMAGE_TILE)
    } else {
      ctx.fillStyle = '#EFE7DA'
      ctx.fillRect(x, y, IMAGE_TILE, IMAGE_TILE)
      ctx.fillStyle = '#6B6358'
      ctx.font = '600 16px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(fitText(ctx, entry.hidden ? labels.hidden : labels.noDrawing, IMAGE_TILE - 24), x + IMAGE_TILE / 2, y + IMAGE_TILE / 2)
      ctx.textAlign = 'left'
    }
    ctx.strokeStyle = 'rgba(31,27,22,0.16)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, IMAGE_TILE - 1, IMAGE_TILE - 1)
    ctx.fillStyle = '#1F1B16'
    ctx.font = '700 20px system-ui, sans-serif'
    ctx.fillText(fitText(ctx, entry.word, IMAGE_TILE), x, y + IMAGE_TILE + 18)
    ctx.fillStyle = '#6B6358'
    ctx.font = '500 15px system-ui, sans-serif'
    ctx.fillText(fitText(ctx, byLine(entry.drawerName), IMAGE_TILE), x, y + IMAGE_TILE + 42)
  })

  ctx.fillStyle = '#6B6358'
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.fillText(footer, IMAGE_GAP, height - 22)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

export default function SketchGallery({ entries, t }: { entries: SketchGalleryEntry[]; t: TFn }) {
  const [isSaving, setIsSaving] = useState(false)
  const hasAnyDrawing = entries.some((entry) => entry.drawing)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const blob = await renderSketchGalleryImage(entries, {
        title: t('games.guess_my_drawing.game.galleryImageTitle'),
        footer: 'boardly.online',
        byLine: (name) => t('games.guess_my_drawing.game.drawnBy', { name }),
        hidden: t('games.guess_my_drawing.game.drawingHidden'),
        noDrawing: t('games.guess_my_drawing.game.galleryNoDrawing'),
      })
      if (!blob) return
      const file = new File([blob], 'boardly-sketch-gallery.png', { type: 'image/png' })
      const nav = typeof navigator !== 'undefined' ? navigator : null
      if (nav?.canShare?.({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: t('games.guess_my_drawing.game.galleryImageTitle') })
          return
        } catch (err) {
          // The player closed the share sheet: nothing to fall back to.
          if (err instanceof DOMException && err.name === 'AbortError') return
        }
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setIsSaving(false)
    }
  }, [entries, t])

  return (
    <div className="sketch-phase" data-testid="sketch-gallery">
      <div className="sketch-reveal-head">
        <div className="sketch-reveal-head__text">
          <p className="sketch-word-chip__label">{t('games.guess_my_drawing.game.galleryKicker')}</p>
          <p className="sketch-reveal-head__word">{t('games.guess_my_drawing.game.galleryTitle')}</p>
        </div>
        {hasAnyDrawing && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            aria-label={t('games.guess_my_drawing.game.saveGallery')}
            className="bd-btn bd-btn-primary sketch-reveal-head__next sketch-gallery-save rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap"
          >
            <Icon name="camera" size={16} />
            <span className="sketch-gallery-save__label">{t('games.guess_my_drawing.game.saveGallery')}</span>
          </button>
        )}
      </div>
      <ul className="sketch-gallery">
        {entries.map((entry, index) => (
          <li key={entry.round} className="sketch-gallery__item social-rise" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
            <div className="sketch-gallery__frame">
              {entry.drawing ? (
                <DrawingThumb drawing={entry.drawing} />
              ) : (
                <p className="sketch-gallery__empty">
                  <Icon name={entry.hidden ? 'eye-off' : 'pencil'} size={16} tone="muted" />
                  {entry.hidden ? t('games.guess_my_drawing.game.drawingHidden') : t('games.guess_my_drawing.game.galleryNoDrawing')}
                </p>
              )}
            </div>
            <p className="sketch-gallery__word">{entry.word}</p>
            <p className="sketch-gallery__by">{t('games.guess_my_drawing.game.drawnBy', { name: entry.drawerName })}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
