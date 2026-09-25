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


export function RegisterPage() {
  const {
    register,
  } = useAuth()

  const navigate = useNavigate()

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [
    passwordConfirm,
    setPasswordConfirm,
  ] = useState('')

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

    if (password !== passwordConfirm) {
      setError(
        'Passwords do not match.',
      )

      return
    }

    setIsSubmitting(true)

    try {
      await register({
        email,
        password,
        password_confirm:
          passwordConfirm,
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
          : 'Unable to create the account.',
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

        <h1>Create account</h1>

        <p className="auth-description">
          Start monitoring your services.
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
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Confirm password

            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => {
                setPasswordConfirm(
                  event.target.value,
                )
              }}
              autoComplete="new-password"
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
              ? 'Creating account…'
              : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already registered?{' '}

          <Link to="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}