import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

describe('the reduced-motion check', () => {
  it('lives in lib/motion.ts only; JavaScript elsewhere imports prefersReducedMotion', () => {
    const copies = ['app', 'components', 'hooks', 'lib', 'contexts']
      .flatMap((dir) => sources(path.join(ROOT, dir)))
      .filter((file) => path.relative(ROOT, file) !== path.join('lib', 'motion.ts'))
      .filter((file) => /matchMedia\(\s*['"`]\(prefers-reduced-motion|function prefersReducedMotion\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file))
    expect(copies).toEqual([])
  })
})
