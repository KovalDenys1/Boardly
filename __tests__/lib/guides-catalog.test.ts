import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { ALL_GUIDES } from '@/lib/guides-catalog'

// #921: `/` and `/games` list every guide, so the catalog must be complete and every
// entry must point at a page that exists.
//
// This used to assert the count was 11, which broke when the twelfth guide was added
// (#1043) and, worse, never checked the thing the comment above promises: a guide page
// added without a catalog entry is invisible on both listings and passed the old test
// happily. The assertions below are on the property rather than on a number, so adding
// a guide correctly needs no edit here and adding one incorrectly fails.
const GUIDES_DIR = join(process.cwd(), 'app', 'guides')

describe('guides catalog', () => {
  it('lists every guide exactly once', () => {
    const slugs = ALL_GUIDES.map((guide) => guide.slug)

    expect(slugs.length).toBeGreaterThan(0)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has a page for every guide', () => {
    for (const guide of ALL_GUIDES) {
      expect(existsSync(join(GUIDES_DIR, guide.slug, 'page.tsx'))).toBe(true)
    }
  })

  it('has a catalog entry for every guide page', () => {
    const catalogued = new Set(ALL_GUIDES.map((guide) => guide.slug))
    const onDisk = readdirSync(GUIDES_DIR).filter(
      (name) =>
        // `components/` holds the shared layout, not a guide; the index lives at
        // app/guides/page.tsx and has no directory of its own.
        name !== 'components' &&
        statSync(join(GUIDES_DIR, name)).isDirectory() &&
        existsSync(join(GUIDES_DIR, name, 'page.tsx'))
    )

    expect(onDisk.filter((slug) => !catalogued.has(slug))).toEqual([])
  })
})
