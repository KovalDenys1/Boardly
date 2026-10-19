import { act, render, screen } from '@testing-library/react'
import i18n, { changeLanguageLazy } from '@/i18n'
import { getBotDisplayName, localizeBotName } from '@/lib/bot-profiles'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'

describe('bot display names (#1491)', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('shows a bot under its name from the locale file, keeping the seat number', async () => {
    await act(async () => {
      await changeLanguageLazy('ru')
    })
    const t = i18n.t.bind(i18n) as (key: string) => string

    expect(localizeBotName(getBotDisplayName('yahtzee', 'hard'), t)).toBe('Оракул кубиков')
    expect(localizeBotName(`${getBotDisplayName('yahtzee', 'easy')} 2`, t)).toBe('Новичок кубиков 2')
    expect(localizeBotName(getBotDisplayName('unknown_game', 'medium'), t)).toBe('ИИ-стратег')
  })

  it('leaves a person\'s name alone', async () => {
    await act(async () => {
      await changeLanguageLazy('de')
    })
    const t = i18n.t.bind(i18n) as (key: string) => string

    expect(localizeBotName('Mia', t)).toBe('Mia')
    expect(localizeBotName('Dice', t)).toBe('Dice')
  })

  it('names a bot on the scoreboard card in the site language', async () => {
    await act(async () => {
      await changeLanguageLazy('de')
    })

    render(
      <GamePlayerCard name="Grid Tactician" isActive={false} isMe={false} isWinner={false} side="right" accentColor="var(--bd-lav)" />
    )

    expect(screen.getByText('Raster-Taktiker')).toBeTruthy()
    expect(screen.queryByText('Grid Tactician')).toBeNull()
  })
})
