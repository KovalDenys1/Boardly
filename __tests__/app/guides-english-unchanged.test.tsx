import { createHash } from 'node:crypto'
import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import { render } from '@testing-library/react'

jest.mock('@/components/AdSlot', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * The DOM each English guide page and the /guides index rendered before #1583 moved their text
 * into per-language copy files. A different hash is a different live English page: change it on
 * purpose, then record the hash the failure prints.
 */
const ENGLISH_DOM: Record<string, string> = {
  'best-2-player-games-online': '1e6a0a0976b93098ce6e61d88621606cfcd08e840a2db132e576e38fcffb8d2b',
  'best-games-to-play-on-zoom': '159c155913abb16d896ba5d079152b17e9dcf03d182e1fbfc5abad6ffbd274c2',
  'best-online-games-for-game-night': 'f6f7488bef74d07e8121e4e4b3294cf940b32209c5d9a34802a390a4fffba7cd',
  'how-to-play-alias-online': 'de0c93e2ae26189141b8a8ba7f7f66c569a69c7560cbeaed82114f012fdfe308',
  'how-to-play-connect-four-online': 'd77cc72ed2e93ef400149f93177aeb25f141d4601246c7636d10e1d41b5b1228',
  'how-to-play-memory-card-game-online': '1b961d0ba7ffc7006cb4b70753519771c2d910818fe5f63b26b4918461c418d3',
  'how-to-play-rock-paper-scissors-online': 'a550966f1a9bda080c42e878ea851b8c04fb307db9c6764e9b51da5d9c296522',
  'how-to-play-spy-game-online': 'a086b2a8ee7c64bd80ac37f7fca97752460b7f994b5c3bb51dcf4cbb3b5d0f7e',
  'how-to-play-tic-tac-toe-online': 'c7ffe3ba7ee5a27cbe69c88f3a4af596d1ccac90ad2429b0db11d438b94831cd',
  'how-to-play-yahtzee-online': '7cce9958434c0a26a930c4b765da28b0b9ef4d96b9c607a26155658fc3e38047',
  index: 'c1a8abe0972c737bf9be393da54c6269ffc259bb70c74efedfeb807a856f48db',
}

/** The same pages' metadata as JSON, before the hreflang set was added to it. */
const ENGLISH_METADATA: Record<string, string> = {
  'best-2-player-games-online': 'a53d16e6034caa7da81061e14991d37cc0edb0320a7cddd8a89c33f51ba22b92',
  'best-games-to-play-on-zoom': '9386d4491bf3cea86c184e0f00d92e20bba8fafe508ef758606611f5fd4dcb09',
  'best-online-games-for-game-night': '94c24479dbfe9db3de5767f6057edee1a59f2cfa05be2a043328cb026f527ccf',
  'how-to-play-alias-online': 'a9ecf03341e143fd2e35f2c56974980c357c186f5d7b5d2559546cde99b78193',
  'how-to-play-connect-four-online': 'ac0246ba531a6c48971a49b59d5de872d65c7781e8cd7b61482b99862d9c6b28',
  'how-to-play-memory-card-game-online': '542af9d6948a64fb59702cd3638b492a2b1835d583a3bbff1760a495d88d5745',
  'how-to-play-rock-paper-scissors-online': '897da97a4a22ffeaea5c8132e989a58dd835d717faefbc0805faf8ac4067b67a',
  'how-to-play-spy-game-online': '4a68db2ee830172c3b1866be8f7914ce7153b7c6b4efbdcdab6f7da23b6565d6',
  'how-to-play-tic-tac-toe-online': '6564678849bfbf146a474c7fdade265da15c00eb54bcc4571f957b048be4142b',
  'how-to-play-yahtzee-online': 'd4b517d61f238db3b1df662d013ebd4ff81dc3bc2382fa1cbe7d5891552d440f',
  index: '48dc86ec927537a42bec53f64067a99ef17bddf1b3520cb25ebeb237cf204355',
}

function pageModule(page: string): { default: ComponentType; metadata: Metadata } {
  return require(`../../app/(site)/guides/${page === 'index' ? '' : `${page}/`}page`)
}

describe('the English guides stay as they were (#1583)', () => {
  it.each(Object.keys(ENGLISH_DOM))('%s renders the same DOM', (page) => {
    const { default: Page } = pageModule(page)
    const { container } = render(<Page />)
    expect({ page, sha256: sha256(container.innerHTML) }).toEqual({ page, sha256: ENGLISH_DOM[page] })
  })

  it.each(Object.keys(ENGLISH_METADATA))('%s keeps its metadata, with only the hreflang set added', (page) => {
    const { metadata } = pageModule(page)
    const alternates = { ...metadata.alternates }
    delete alternates.languages
    const before = JSON.stringify({ ...metadata, alternates })
    expect({ page, sha256: sha256(before) }).toEqual({ page, sha256: ENGLISH_METADATA[page] })
  })
})
