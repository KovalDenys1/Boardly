import { existsSync } from 'fs'
import { join } from 'path'
import { ALL_GUIDES } from '@/lib/guides-catalog'

// #921: `/` and `/games` list every guide, so the catalog must be complete
// and every entry must point at a page that exists.
describe('guides catalog', () => {
  it('lists all 11 guides once', () => {
    const slugs = ALL_GUIDES.map((guide) => guide.slug)

    expect(slugs).toHaveLength(11)
    expect(new Set(slugs).size).toBe(11)
  })

  it('has a page for every guide', () => {
    for (const guide of ALL_GUIDES) {
      expect(existsSync(join(process.cwd(), 'app', 'guides', guide.slug, 'page.tsx'))).toBe(true)
    }
  })
})
