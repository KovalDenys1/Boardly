// @ts-nocheck

import { findUntranslatedStrings } from '@/scripts/audit-i18n'

const scan = (source: string) => findUntranslatedStrings('Sample.tsx', source).map((finding) => finding.text)

describe('audit-i18n', () => {
  it('finds a string written straight into JSX', () => {
    expect(scan('const A = () => <p>Recent Rolls</p>')).toEqual(['Recent Rolls'])
  })

  /**
   * The reason this audit walks the AST at all. A regex over `>...<` reads the
   * type argument here as a text node, and on the first pass over this repo
   * roughly half of everything a regex reported was code shaped like this.
   */
  it('does not mistake a type argument for JSX text', () => {
    const source = [
      'const [game, setGame] = useState<AliasGame | null>(null)',
      'const ref = useRef<HTMLDivElement>(null)',
      'function pick<T extends string>(value: T): T { return value }',
    ].join('\n')

    expect(scan(source)).toEqual([])
  })

  it('does not flag a string that already goes through t()', () => {
    expect(scan("const A = () => <p>{t('lobby.recentRolls')}</p>")).toEqual([])
  })

  it('flags the attributes a person actually reads', () => {
    const source = 'const A = () => <input placeholder="Your name" aria-label="Player name" />'

    expect(scan(source)).toEqual(['Your name', 'Player name'])
  })

  it('ignores attributes nobody reads', () => {
    const source = 'const A = () => <div className="flex items-center" data-testid="player row" id="seat" />'

    expect(scan(source)).toEqual([])
  })

  it('ignores separators and counters, which are not copy', () => {
    const source = 'const A = () => <span>· — 1/2 &nbsp; 42%</span>'

    expect(scan(source)).toEqual([])
  })

  it('honours an i18n-allow comment on the line and the line above', () => {
    const source = [
      'const A = () => (',
      '  <>',
      '    {/* i18n-allow: brand name */}',
      '    <p>Boardly</p>',
      '    <p>Untranslated</p>',
      '  </>',
      ')',
    ].join('\n')

    expect(scan(source)).toEqual(['Untranslated'])
  })

  it('reports the line so a failure can be found without searching', () => {
    const source = ['const A = () => (', '  <p>Subtotal</p>', ')'].join('\n')

    expect(findUntranslatedStrings('Sample.tsx', source)).toEqual([
      { file: 'Sample.tsx', line: 2, text: 'Subtotal' },
    ])
  })
})

describe('audit-i18n — default prop values', () => {
  /**
   * The hole that shipped English onto the Russian login page in v1.24.0:
   * `label = 'Password'` is a default parameter value, not JSX, so the JsxText
   * and attribute checks both walk straight past it.
   */
  it('flags a user-visible prop whose default is an English literal', () => {
    const source = "export default function PasswordInput({ value, label = 'Password' }) { return <label>{label}</label> }"

    expect(scan(source)).toEqual(['Password'])
  })

  it('flags a renamed binding by the prop name, not the local name', () => {
    const source = "const A = ({ title: heading = 'Untitled lobby' }) => <h2>{heading}</h2>"

    expect(scan(source)).toEqual(['Untitled lobby'])
  })

  it('ignores defaults on props nobody reads', () => {
    const source = "const A = ({ variant = 'primary', size = 'lg', testId = 'seat-row' }) => <div />"

    expect(scan(source)).toEqual([])
  })

  it('ignores a default that is not copy', () => {
    const source = "const A = ({ placeholder = '••••••••' }) => <input placeholder={placeholder} />"

    expect(scan(source)).toEqual([])
  })
})

describe('audit-i18n — prop names matched by kind, not by an exact list', () => {
  /**
   * The exact list missed `primaryCtaLabel = 'Play now'` on the day it was
   * written, and that default shipped an English button to two more pages.
   * Prop names here read `<what><Kind>`, so the kind is a suffix.
   */
  it.each([
    ['primaryCtaLabel', 'Play now'],
    ['emptyStateText', 'Nothing here yet'],
    ['dialogTitle', 'Are you sure?'],
    ['errorMessage', 'Something went wrong'],
    ['searchPlaceholder', 'Find a game'],
  ])('flags %s', (prop, value) => {
    const source = `const A = ({ ${prop} = '${value}' }) => <p>{${prop}}</p>`

    expect(scan(source)).toEqual([value])
  })

  it('still ignores a prop whose name only happens to end in a word', () => {
    const source = "const A = ({ cancelled = 'yes', total = 'sum', isLabelled = 'no' }) => <div />"

    expect(scan(source)).toEqual([])
  })
})
