import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { accentTextLines, focusColourLines } from '../../scripts/design-token-rules'

describe('accent colour used as text', () => {
  it.each([
    ['a fill as text', '<p className="text-bd-coral">'],
    ['a fill as a hover colour', '<a className="underline hover:text-bd-coral">'],
    ['a shade as text', '<span className="text-xs text-bd-sun-deep">'],
    ['a fill through a variable', '<p className="text-(--bd-coral)">'],
    ['the premium fill', "isPremium ? 'text-bd-premium' : 'text-bd-ink'"],
    ['Tailwind amber', "isPremium ? 'text-amber-500' : ''"],
    ['a shade in an inline style', "<span style={{ color: 'var(--bd-sun-deep)' }}>"],
  ])('flags %s', (_label, line) => {
    expect(accentTextLines(line)).toEqual([1])
  })

  it.each([
    ['the text token', '<p className="text-bd-coral-text">'],
    ['a dark-only variant', '<p className="text-bd-lav-text dark:text-bd-lav">'],
    ['a fill as a background', '<p className="bg-bd-coral text-bd-ink-on-accent">'],
    ['the sun text token', '<p className="text-bd-sun-text">'],
  ])('leaves %s alone', (_label, line) => {
    expect(accentTextLines(line)).toEqual([])
  })

  it('honours an accent-text-allow comment on the line or the one above', () => {
    expect(accentTextLines('{/* accent-text-allow: on the dark skin */}\n<p className="text-bd-coral">')).toEqual([])
  })
})

describe('focus ring colour', () => {
  it.each([
    ['an ink ring', 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-ink'],
    ['a coral outline', 'focus-visible:outline-2 focus-visible:outline-bd-coral!'],
    ['a palette ring', 'focus:ring-2 focus:ring-inset focus:ring-red-500'],
  ])('flags %s', (_label, line) => {
    expect(focusColourLines(line)).toEqual([1])
  })

  it('leaves the lav-deep ring and the width and offset utilities alone', () => {
    expect(focusColourLines('focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:-outline-offset-2')).toEqual([])
  })
})

function scan(rule: (src: string) => number[]): string[] {
  const root = path.join(__dirname, '..', '..')
  const found: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(name)) for (const line of rule(readFileSync(full, 'utf8'))) found.push(`${path.relative(root, full)}:${line}`)
    }
  }
  for (const dir of ['app', 'components']) if (existsSync(path.join(root, dir))) walk(path.join(root, dir))
  return found
}

describe('the app and components', () => {
  it('draw accent-coloured text only with the --bd-*-text tokens', () => {
    expect(scan(accentTextLines)).toEqual([])
  })

  it('draw every focus ring in lav-deep', () => {
    expect(scan(focusColourLines)).toEqual([])
  })
})
