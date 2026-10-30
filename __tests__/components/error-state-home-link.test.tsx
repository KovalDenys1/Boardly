// @ts-nocheck

import { render, screen } from '@testing-library/react'
import BoardlyErrorState from '@/components/BoardlyErrorState'
import DePageLocale from '@/components/i18n/DePageLocale'
import NoPageLocale from '@/components/i18n/NoPageLocale'
import RuPageLocale from '@/components/i18n/RuPageLocale'
import UkPageLocale from '@/components/i18n/UkPageLocale'
import de from '@/locales/de'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('the error page home link (#1394)', () => {
  it('goes to /ru from a /ru page and to /uk from a /uk page', () => {
    render(
      <RuPageLocale>
        <BoardlyErrorState />
      </RuPageLocale>
    )
    expect(screen.getByRole('link', { name: ru.errorPage.goHome })).toHaveAttribute('href', '/ru')
    render(
      <UkPageLocale>
        <BoardlyErrorState />
      </UkPageLocale>
    )
    expect(screen.getByRole('link', { name: uk.errorPage.goHome })).toHaveAttribute('href', '/uk')
  })

  it('goes to /no from a /no page', () => {
    render(
      <NoPageLocale>
        <BoardlyErrorState />
      </NoPageLocale>
    )
    expect(screen.getByRole('link', { name: no.errorPage.goHome })).toHaveAttribute('href', '/no')
  })

  it('goes to /de from a /de page (#1610)', () => {
    render(
      <DePageLocale>
        <BoardlyErrorState />
      </DePageLocale>
    )
    expect(screen.getByRole('link', { name: de.errorPage.goHome })).toHaveAttribute('href', '/de')
  })

  it('goes to / elsewhere', () => {
    render(<BoardlyErrorState />)
    expect(screen.getByRole('link', { name: en.errorPage.goHome })).toHaveAttribute('href', '/')
  })
})
