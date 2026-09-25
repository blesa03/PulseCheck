import {
  useState,
} from 'react'

import {
  Link,
  useNavigate,
} from 'react-router-dom'

import {
  ApiError,
} from '../api/client'

import {
  useAuth,
} from '../auth/useAuth'

import type {
  FormEvent,
} from 'react'


export function LoginPage() {
  const {
    login,
  } = useAuth()

  const navigate = useNavigate()

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [error, setError] =
    useState<string | null>(null)

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setError(null)
    setIsSubmitting(true)

    try {
      await login({
        email,
        password,
      })

      navigate(
        '/dashboard',
        {
          replace: true,
        },
      )
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Unable to sign in.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">
          PulseCheck
        </div>

        <h1>Sign in</h1>

        <p className="auth-description">
          Access your monitoring dashboard.
        </p>

        <form
          onSubmit={handleSubmit}
          className="auth-form"
        >
          <label>
            Email

            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(
                  event.target.value,
                )
              }}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password

            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(
                  event.target.value,
                )
              }}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <p
              className="form-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Signing in…'
              : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          No account yet?{' '}

          <Link to="/register">
            Create one
          </Link>
        </p>
      </section>
    </main>
  )
}