import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'

import {
  errorMessage,
  formatDate,
  formatNumber,
  formatPercentage,
  getLanguage,
  setLanguage,
  t,
  useLanguage,
} from './index'

import { LanguageSwitcher } from './LanguageSwitcher'

function ExampleScreen() {
  useLanguage()

  return (
    <div>
      <h1>{t('Sign in')}</h1>
      <p>{t('Monitoring health')}</p>
      <LanguageSwitcher />
    </div>
  )
}

afterEach(() => {
  cleanup()
  setLanguage('en')
  window.localStorage.removeItem('pulsecheck.language')
})

describe('internationalization', () => {
  it('uses English as the default language', () => {
    setLanguage('en')

    expect(getLanguage()).toBe('en')
    expect(t('Sign in')).toBe('Sign in')
    expect(t('Monitoring health')).toBe('Monitoring health')
  })

  it('translates interface strings into Spanish', () => {
    setLanguage('es')

    expect(t('Sign in')).toBe('Iniciar sesión')
    expect(t('Monitoring health')).toBe('Estado de la monitorización')
    expect(t('DOWN')).toBe('CAÍDO')
    expect(t('Delete "{name}"?', { name: 'API' }))
      .toBe('¿Eliminar "API"?')
  })

  it('switches language without navigating or reloading', () => {
    setLanguage('en')

    render(<ExampleScreen />)

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeDefined()

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Language' }),
      { target: { value: 'es' } },
    )

    expect(
      screen.getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeDefined()

    expect(
      screen.getByText('Estado de la monitorización'),
    ).toBeDefined()
  })

  it('persists the selected language', () => {
    setLanguage('es')

    expect(getLanguage()).toBe('es')
    expect(
      window.localStorage.getItem('pulsecheck.language'),
    ).toBe('es')
    expect(document.documentElement.lang).toBe('es')
  })

  it('formats numbers and percentages for Spanish', () => {
    setLanguage('es')

    expect(formatNumber(12345)).toBe('12.345')
    expect(formatPercentage(99.5)).toBe('99,50%')
    expect(formatDate('2026-09-30')).not.toBe('Sep 30')
  })

  it('preserves English formatting', () => {
    setLanguage('en')

    expect(formatNumber(12345)).toBe('12,345')
    expect(formatPercentage(99.5)).toBe('99.50%')
  })

  it('localizes API errors shown to users', () => {
    setLanguage('es')

    const invalidRequest = Object.assign(
      new Error('Invalid data.'),
      { status: 400 },
    )

    const rateLimited = Object.assign(
      new Error('Request was throttled.'),
      { status: 429 },
    )

    expect(errorMessage(invalidRequest, 'Request failed.'))
      .toBe('Comprueba los datos introducidos.')

    expect(errorMessage(rateLimited, 'Request failed.'))
      .toBe('Demasiadas solicitudes. Inténtalo más tarde.')
  })

  it('retains unrecognized user-written content', () => {
    setLanguage('es')

    expect(t('My production API')).toBe('My production API')
  })
})