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
  'best-2-player-games-online': '3a620dd5289078f2576063e4fc564d143ff3ed50decea8a4b08957d64d0e7fca',
  'best-games-to-play-on-zoom': '0421b1dd0d417ad807e2fe6b74f7e68a6d7a9288f47acd3111d4cfde5d4258af',
  'best-online-games-for-game-night': 'd214dd62cf55528f8d99dbc17bdcb4f1a3919f2694e1fecf0b8954063714d732',
  'how-to-play-alias-online': 'e5eced559702e910006fe5934d4a1d40f2adef6cdf4bc945cdbe78b9b6b2651a',
  'how-to-play-connect-four-online': '7d45121a5262f471280a56d51adbac6ede847d641ad392bb8f9259bb4043dc95',
  'how-to-play-memory-card-game-online': '9a6ecc0fd191e0c5406546ddc67ab204df31cf69ebcd16e660d7b6ccdae7f525',
  'how-to-play-rock-paper-scissors-online': '86b82cda464ad602be518d1e2e2e725b9ed6a019aa16e7a4b83d904945713a9a',
  'how-to-play-spy-game-online': '74ad9aa885f7c6cc0f8689c37a7977fe3ee6117a1dc9eb50bf02132d09a88a7c',
  'how-to-play-tic-tac-toe-online': '2dc20ad68da354457de58a92ee563254df13dbe5d7a53496f350fb108266b0a0',
  'how-to-play-yahtzee-online': 'ff4c2374cc8c78a5b33e99ea4e444cc0626c2907ab64c9dfc80d86d7b6fefe3b',
  index: '07441d4ffd68a7ef79656efdf89e923429b6524a2d9f9ceaa7e4adb75989af56',
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
