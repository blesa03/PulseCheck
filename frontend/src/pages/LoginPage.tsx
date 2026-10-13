import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { errorMessage, t, useLanguage } from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'

import type { FormEvent } from 'react'

export function LoginPage() {
  useLanguage()

  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login({ email, password })
      navigate('/dashboard', { replace: true })
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to sign in.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">PulseCheck</div>
        <h1>{t('Sign in')}</h1>
        <p className="auth-description">
          {t('Access your monitoring dashboard.')}
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
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" disabled={isSubmitting}>
            {t(isSubmitting ? 'Signing in…' : 'Sign in')}
          </button>
        </form>

        <p className="auth-switch">
          {t('No account yet?')}{' '}
          <Link to="/register">{t('Create one')}</Link>
        </p>

        <LanguageSwitcher />
      </section>
    </main>
  )
}