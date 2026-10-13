import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { errorMessage, t, useLanguage } from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'

import type { FormEvent } from 'react'

export function RegisterPage() {
  useLanguage()

  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== passwordConfirm) {
      setError(t('Passwords do not match.'))
      return
    }

    setIsSubmitting(true)

    try {
      await register({
        email,
        password,
        password_confirm: passwordConfirm,
      })
      navigate('/dashboard', { replace: true })
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to create the account.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">PulseCheck</div>
        <h1>{t('Create account')}</h1>
        <p className="auth-description">
          {t('Start monitoring your services.')}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            {t('Email')}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            {t('Password')}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            {t('Confirm password')}
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" disabled={isSubmitting}>
            {t(isSubmitting ? 'Creating account…' : 'Create account')}
          </button>
        </form>

        <p className="auth-switch">
          {t('Already registered?')}{' '}
          <Link to="/login">{t('Sign in')}</Link>
        </p>

        <LanguageSwitcher />
      </section>
    </main>
  )
}