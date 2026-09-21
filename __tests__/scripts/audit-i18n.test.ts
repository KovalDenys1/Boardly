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
