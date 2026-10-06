import { EMAIL_LOGO_IMAGE, type EmailImage } from './email-art'
import { BOARDLY_URL, SUPPORT_EMAIL } from './organization-json-ld'

export const EMAIL_LOGO = EMAIL_LOGO_IMAGE

export type EmailLanguage = 'en' | 'nb'

export type EmailInline = string | { strong: string } | { text: string; href: string }
export type EmailContent = string | EmailInline[]

export type EmailDetailSection = { heading: string; paragraphs?: EmailContent[]; items?: string[] }

export type EmailBlock =
  | { type: 'paragraph'; content: EmailContent }
  /** The one or two sentences a reader needs, in larger type, above the action. */
  | { type: 'lead'; content: EmailContent }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; tone: 'warning' | 'danger'; text: string }
  | { type: 'button'; label: string; href: string; tone?: 'danger' | 'quiet' }
  | { type: 'fallbackLink'; text: string; href: string }
  | { type: 'note'; content: EmailContent }
  /** The few figures a summary rests on (a plan, an amount, a date), as label and value rows. */
  | { type: 'facts'; rows: { label: string; value: string }[] }
  /** The full detail under the summary, in smaller type, one titled section each. */
  | { type: 'details'; sections: EmailDetailSection[] }

export type EmailSheet = {
  lang: EmailLanguage
  title: string
  blocks: EmailBlock[]
  /** A wide picture under the logo. */
  hero?: EmailImage
  /** A small icon above the title, for notices. */
  icon?: EmailImage
}

export type EmailLayout = {
  preheader: string
  sheets: EmailSheet[]
  /** Lines under the sheets. Each group is one paragraph. */
  footer: EmailContent[][]
  /** URLs that become links wherever a paragraph, a note or a footer line names them. */
  links?: readonly string[]
}

const LANGUAGE_NAMES: Record<EmailLanguage, string> = { en: 'English', nb: 'Norsk' }

const PAPER = '#FBF6EE'
const CARD = '#FFFFFF'
const INK = '#1F1B16'
const INK_SOFT = '#4A3F33'
const LINE = '#E8DDC8'
const CORAL = '#FF6B5B'
const CORAL_DEEP = '#E04B3B'
const SUN = '#FFC44D'
const SUN_WASH = '#FFF1D2'
const DANGER_WASH = '#FFF2EF'
const DANGER_LINE = '#F0B3AC'
const DANGER_INK = '#A6554A'

const DARK_PAPER = '#1E1B17'
const DARK_CARD = '#2B2720'
const DARK_INK = '#F0E8DB'
const DARK_INK_SOFT = '#B5A494'
const DARK_LINE = '#4A433B'
const DARK_SUN_WASH = '#453A22'
const DARK_DANGER_WASH = '#3B2420'

const BODY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const DISPLAY_FONT = `'Bricolage Grotesque', ${BODY_FONT}`

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const LINK_STYLE = `color: ${INK}; text-decoration: underline; text-decoration-color: ${CORAL}; text-decoration-thickness: 2px; text-underline-offset: 3px;`

function anchor(href: string, label: string): string {
  return `<a href="${href}" class="bd-ink" style="${LINK_STYLE}">${label}</a>`
}

// Runs on text that is already escaped, so copy never carries markup of its own.
function autolink(escaped: string, links: readonly string[]): string {
  const needles = [...new Set([...links.map(escapeHtml), SUPPORT_EMAIL])]
    .filter((needle) => needle.length > 0)
    .sort((a, b) => b.length - a.length)
  const pattern = new RegExp(needles.map((needle) => needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
  return escaped.replace(pattern, (match) => anchor(match === SUPPORT_EMAIL ? `mailto:${match}` : match, match))
}

function contentHtml(content: EmailContent, links: readonly string[]): string {
  const parts = typeof content === 'string' ? [content] : content
  return parts
    .map((part) => {
      if (typeof part === 'string') return autolink(escapeHtml(part), links)
      if ('strong' in part) return `<strong>${escapeHtml(part.strong)}</strong>`
      const link = anchor(escapeHtml(part.href), escapeHtml(part.text))
      return /\s/.test(part.text) ? link : link.replace(' style="', ' style="white-space: nowrap; ')
    })
    .join('')
}

export function contentText(content: EmailContent): string {
  const parts = typeof content === 'string' ? [content] : content
  return parts
    .map((part) => {
      if (typeof part === 'string') return part
      if ('strong' in part) return part.strong
      return `${part.text} (${part.href})`
    })
    .join('')
}

/**
 * The light picture is the one every client shows; the dark one replaces it only where the
 * client says it is in dark mode, and Outlook on Windows never sees it at all.
 */
function imageHtml(image: EmailImage, style: string): string {
  const attrs = (src: string) =>
    `src="${escapeHtml(src)}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.alt)}"`
  const base = `border: 0; outline: none; text-decoration: none; ${style}`
  return (
    `<img ${attrs(image.light)} class="bd-img-light" style="display: block; ${base}">` +
    `<!--[if !mso]><!--><img ${attrs(image.dark)} class="bd-img-dark" style="display: none; max-height: 0; overflow: hidden; ${base}"><!--<![endif]-->`
  )
}

const BUTTON_TONES = {
  primary: { cell: 'bd-button', fill: CORAL, lip: CORAL_DEEP, label: INK, edge: CORAL },
  danger: { cell: 'bd-button-danger', fill: INK, lip: CORAL, label: PAPER, edge: INK },
  quiet: { cell: 'bd-button-quiet', fill: CARD, lip: INK, label: INK, edge: INK },
} as const

function buttonHtml(block: Extract<EmailBlock, { type: 'button' }>): string {
  const tone = BUTTON_TONES[block.tone ?? 'primary']
  const href = escapeHtml(block.href)
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td class="${tone.cell}" bgcolor="${tone.fill}" style="background: ${tone.fill}; border: 2px solid ${tone.edge}; border-bottom: 4px solid ${tone.lip}; border-radius: 16px; mso-padding-alt: 13px 26px 11px;">` +
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 13px 26px 11px; font-family: ${BODY_FONT}; font-size: 17px; line-height: 20px; font-weight: 700; color: ${tone.label}; text-decoration: none; border-radius: 14px;">${escapeHtml(block.label)}</a>` +
    `</td></tr></table>`
  )
}

// Outlook on Windows ignores a margin on a table, so the space around one is a cell's padding.
function spaced(table: string, padding: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding: ${padding};">${table}</td></tr></table>`
}

function calloutHtml(block: Extract<EmailBlock, { type: 'callout' }>): string {
  const danger = block.tone === 'danger'
  const wash = danger ? DANGER_WASH : SUN_WASH
  const edge = danger ? DANGER_LINE : SUN
  const ink = danger ? DANGER_INK : INK
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
    `<td class="${danger ? 'bd-callout-danger' : 'bd-callout-warning'}" bgcolor="${wash}" style="background: ${wash}; border: 2px solid ${edge}; border-radius: 16px; padding: 12px 16px; font-family: ${BODY_FONT}; font-size: 15px; line-height: 1.5; font-weight: 700; color: ${ink};">` +
    `${escapeHtml(block.text)}</td></tr></table>`
  )
}

function detailsHtml(block: Extract<EmailBlock, { type: 'details' }>, links: readonly string[]): string {
  const sections = block.sections
    .map(
      (section) =>
        `<h3 class="bd-ink" style="margin: 18px 0 4px; font-family: ${DISPLAY_FONT}; font-size: 15px; line-height: 1.35; font-weight: 800; color: ${INK};">${escapeHtml(section.heading)}</h3>` +
        (section.paragraphs ?? [])
          .map((content) => `<p class="bd-soft" style="margin: 0 0 8px; font-size: 14px; line-height: 1.55; color: ${INK_SOFT};">${contentHtml(content, links)}</p>`)
          .join('') +
        (section.items?.length
          ? `<ul class="bd-soft" style="margin: 0 0 8px 20px; padding: 0; font-size: 14px; line-height: 1.55; color: ${INK_SOFT};">` +
            section.items.map((item) => `<li style="margin: 0 0 3px;">${escapeHtml(item)}</li>`).join('') +
            `</ul>`
          : '')
    )
    .join('')
  return `<div class="bd-rule" style="margin: 6px 0 14px; padding: 2px 0 0; border-top: 2px solid ${LINE};">${sections}</div>`
}

function factsHtml(block: Extract<EmailBlock, { type: 'facts' }>): string {
  const rows = block.rows
    .map(
      (row, index) =>
        `<tr><td width="40%" class="bd-soft${index > 0 ? ' bd-rule' : ''}" style="padding: 9px 12px 9px 16px; font-size: 13px; line-height: 1.4; color: ${INK_SOFT};${index > 0 ? ` border-top: 1px solid ${LINE};` : ''}">${escapeHtml(row.label)}</td>` +
        `<td class="bd-ink${index > 0 ? ' bd-rule' : ''}" style="padding: 9px 16px 9px 0; font-size: 15px; line-height: 1.4; font-weight: 700; color: ${INK};${index > 0 ? ` border-top: 1px solid ${LINE};` : ''}">${escapeHtml(row.value)}</td></tr>`
    )
    .join('')
  return spaced(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bd-facts" bgcolor="${PAPER}" style="background: ${PAPER}; border: 2px solid ${LINE}; border-radius: 16px; border-collapse: separate;">${rows}</table>`,
    '2px 0 18px'
  )
}

function blockHtml(block: EmailBlock, links: readonly string[]): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${contentHtml(block.content, links)}</p>`
    case 'lead':
      return `<p class="bd-ink" style="margin: 0 0 16px; font-size: 18px; line-height: 1.5; color: ${INK};">${contentHtml(block.content, links)}</p>`
    case 'heading':
      return `<h2 class="bd-ink" style="margin: 26px 0 8px; font-family: ${DISPLAY_FONT}; font-size: 18px; line-height: 1.3; font-weight: 800; color: ${INK};">${escapeHtml(block.text)}</h2>`
    case 'list':
      return (
        `<ul style="margin: 0 0 14px 22px; padding: 0;">` +
        block.items.map((item) => `<li style="margin: 0 0 6px;">${escapeHtml(item)}</li>`).join('') +
        `</ul>`
      )
    case 'callout':
      return spaced(calloutHtml(block), '4px 0 18px')
    case 'button':
      return spaced(buttonHtml(block), '6px 0 20px')
    case 'fallbackLink': {
      const href = escapeHtml(block.href)
      return (
        `<p class="bd-soft" style="margin: 0 0 2px; font-size: 13px; line-height: 1.5; color: ${INK_SOFT};">${escapeHtml(block.text)}</p>` +
        `<p style="margin: 0 0 14px; font-size: 13px; line-height: 1.5; word-break: break-all;"><a href="${href}" class="bd-soft" style="color: ${INK_SOFT}; text-decoration: underline;">${href}</a></p>`
      )
    }
    case 'note':
      return `<p class="bd-soft bd-rule" style="margin: 20px 0 14px; padding: 14px 0 0; border-top: 2px solid ${LINE}; font-size: 13px; line-height: 1.55; color: ${INK_SOFT};">${contentHtml(block.content, links)}</p>`
    case 'facts':
      return factsHtml(block)
    case 'details':
      return detailsHtml(block, links)
  }
}

function languageTabs(current: EmailLanguage, all: EmailLanguage[]): string {
  const chip = 'display: inline-block; padding: 2px 11px; border-radius: 999px; font-size: 12px; line-height: 18px; font-weight: 700;'
  const tabs = all.map((lang, index) => {
    const name = LANGUAGE_NAMES[lang]
    if (lang === current) {
      return `<span class="bd-tab-on" style="${chip} background: ${SUN}; border: 2px solid ${INK}; color: ${INK};">${name}</span>`
    }
    const arrow = index > all.indexOf(current) ? '&darr;' : '&uarr;'
    return `<span class="bd-tab-off" style="${chip} border: 2px solid ${LINE}; color: ${INK_SOFT};">${name} ${arrow}</span>`
  })
  return tabs.join('&nbsp; ')
}

// The logo sits in the card's own padding, so its left edge is the text's left edge at
// every width; the language chips share its row.
function sheetHeader(sheet: EmailSheet, index: number, languages: EmailLanguage[]): string {
  const logo =
    index === 0
      ? `<a href="${BOARDLY_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">${imageHtml(
          EMAIL_LOGO,
          `width: ${EMAIL_LOGO.width}px; height: ${EMAIL_LOGO.height}px; font-family: ${DISPLAY_FONT}; font-size: 24px; font-weight: 800; color: ${INK};`
        )}</a>`
      : ''
  const tabs = languages.length > 1 ? languageTabs(sheet.lang, languages) : ''
  if (!logo && !tabs) return ''
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
    `<td align="left" valign="middle" style="padding: 0 0 20px;">${logo}</td>` +
    `<td align="right" valign="middle" style="padding: 0 0 20px; white-space: nowrap;">${tabs}</td>` +
    `</tr></table>`
  )
}

function sheetHtml(sheet: EmailSheet, index: number, layout: EmailLayout): string {
  const links = layout.links ?? []
  const languages = layout.sheets.map((each) => each.lang)
  const hero = sheet.hero
    ? `<div style="margin: 0 0 22px;">${imageHtml(sheet.hero, `width: 100%; max-width: ${sheet.hero.width}px; height: auto; border-radius: 22px;`)}</div>`
    : ''
  const icon = sheet.icon
    ? `<div style="margin: 0 0 14px;">${imageHtml(sheet.icon, `width: ${sheet.icon.width}px; height: ${sheet.icon.height}px;`)}</div>`
    : ''
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bd-card" bgcolor="${CARD}" style="background: ${CARD}; border: 2px solid ${INK}; border-bottom: 6px solid ${INK}; border-radius: 24px; border-collapse: separate;"><tr>` +
    `<td class="bd-sheet bd-ink" style="padding: 24px 28px 14px; font-family: ${BODY_FONT}; font-size: 16px; line-height: 1.6; color: ${INK}; word-break: break-word; overflow-wrap: anywhere;">` +
    sheetHeader(sheet, index, languages) +
    `<div lang="${sheet.lang}">` +
    hero +
    icon +
    `<h1 class="bd-title bd-ink" style="margin: 0 0 14px; font-family: ${DISPLAY_FONT}; font-size: 28px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; color: ${INK};">${escapeHtml(sheet.title)}</h1>` +
    sheet.blocks.map((block) => blockHtml(block, links)).join('') +
    `</div></td></tr></table>`
  )
}

function footerHtml(layout: EmailLayout): string {
  const links = layout.links ?? []
  return layout.footer
    .filter((group) => group.length > 0)
    .map(
      (group) =>
        `<p class="bd-soft" style="margin: 0 0 10px; font-size: 13px; line-height: 1.6; color: ${INK_SOFT};">` +
        group.map((line) => contentHtml(line, links)).join('<br>') +
        `</p>`
    )
    .join('')
}

const STYLES = `
:root { color-scheme: light dark; }
body { margin: 0; padding: 0; }
.bd-sheet p { margin: 0 0 14px; }
@media (max-width: 480px) {
  .bd-outer { padding: 16px 10px 28px !important; }
  .bd-sheet { padding: 20px 20px 10px !important; }
  .bd-title { font-size: 24px !important; }
  .bd-footer { padding: 16px 22px 0 !important; }
}
@media (prefers-color-scheme: dark) {
  .bd-page { background: ${DARK_PAPER} !important; }
  .bd-card { background: ${DARK_CARD} !important; border-color: ${DARK_INK} !important; }
  .bd-ink { color: ${DARK_INK} !important; }
  .bd-soft { color: ${DARK_INK_SOFT} !important; }
  .bd-rule { border-color: ${DARK_LINE} !important; }
  .bd-facts { background: ${DARK_PAPER} !important; border-color: ${DARK_LINE} !important; }
  .bd-img-light { display: none !important; }
  .bd-img-dark { display: block !important; max-height: none !important; }
  .bd-tab-on { border-color: ${SUN} !important; }
  .bd-tab-off { border-color: ${DARK_LINE} !important; color: ${DARK_INK_SOFT} !important; }
  .bd-button-danger { background: ${DARK_INK} !important; border-color: ${DARK_INK} !important; }
  .bd-button-danger a { color: ${INK} !important; }
  .bd-button-quiet { background: ${DARK_CARD} !important; border-color: ${DARK_INK} !important; }
  .bd-button-quiet a { color: ${DARK_INK} !important; }
  .bd-callout-warning { background: ${DARK_SUN_WASH} !important; color: ${DARK_INK} !important; }
  .bd-callout-danger { background: ${DARK_DANGER_WASH} !important; border-color: ${DANGER_INK} !important; color: ${DANGER_LINE} !important; }
}
[data-ogsb] .bd-page { background: ${DARK_PAPER} !important; }
[data-ogsb] .bd-card { background: ${DARK_CARD} !important; border-color: ${DARK_INK} !important; }
[data-ogsc] .bd-ink { color: ${DARK_INK} !important; }
[data-ogsc] .bd-soft { color: ${DARK_INK_SOFT} !important; }
[data-ogsc] .bd-button a { color: ${INK} !important; }
[data-ogsc] .bd-img-light { display: none !important; }
[data-ogsc] .bd-img-dark { display: block !important; max-height: none !important; }
`

// Mail clients fill the line beside the subject with whatever follows the preheader.
const PREHEADER_FILLER = '&#847;&zwnj;&nbsp;'.repeat(60)

function renderHtml(layout: EmailLayout): string {
  const sheets = layout.sheets
    .map((sheet, index) => `<tr><td style="padding: 0 0 16px;">${sheetHtml(sheet, index, layout)}</td></tr>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="${layout.sheets[0]?.lang ?? 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(layout.sheets[0]?.title ?? EMAIL_LOGO.alt)}</title>
<style>${STYLES}</style>
</head>
<body class="bd-page" style="margin: 0; padding: 0; background: ${PAPER};">
<div style="display: none; max-height: 0; max-width: 0; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: ${PAPER}; mso-hide: all;">${escapeHtml(layout.preheader)}${PREHEADER_FILLER}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bd-page" bgcolor="${PAPER}" style="background: ${PAPER};"><tr><td align="center" class="bd-outer" style="padding: 28px 16px 36px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
${sheets}
<tr><td class="bd-footer" align="left" style="padding: 8px 30px 0; font-family: ${BODY_FONT};">${footerHtml(layout)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`
}

function blockLines(block: EmailBlock): string[] {
  switch (block.type) {
    case 'paragraph':
    case 'lead':
    case 'note':
      return [contentText(block.content)]
    case 'heading':
      return [block.text.toUpperCase()]
    case 'list':
      return block.items.map((item) => `- ${item}`)
    case 'callout':
      return [block.text]
    case 'button':
      return [`${block.label}: ${block.href}`]
    case 'fallbackLink':
      return [block.text, block.href]
    case 'facts':
      return block.rows.map((row) => `${row.label}: ${row.value}`)
    case 'details':
      return []
  }
}

function sheetText(sheet: EmailSheet): string {
  const groups: string[][] = []
  let underHeading = false
  for (const block of sheet.blocks) {
    if (block.type === 'details') {
      for (const section of block.sections) {
        groups.push([
          section.heading.toUpperCase(),
          ...(section.paragraphs ?? []).map(contentText),
          ...(section.items ?? []).map((item) => `- ${item}`),
        ])
      }
      underHeading = false
      continue
    }
    const lines = blockLines(block)
    if (underHeading && (block.type === 'paragraph' || block.type === 'list')) {
      groups[groups.length - 1].push(...lines)
    } else {
      groups.push(lines)
      underHeading = block.type === 'heading'
    }
  }
  return [sheet.title, ...groups.map((group) => group.join('\n'))].join('\n\n')
}

function renderText(layout: EmailLayout): string {
  const sheets = layout.sheets.map(sheetText)
  const parts = sheets.length > 1 ? sheets.flatMap((sheet) => [sheet, '----']) : sheets
  return [...parts, ...layout.footer.map((group) => group.map(contentText).join('\n'))]
    .filter((part) => part.length > 0)
    .join('\n\n')
}

export function renderEmail(layout: EmailLayout): { html: string; text: string } {
  return { html: renderHtml(layout), text: renderText(layout) }
}
