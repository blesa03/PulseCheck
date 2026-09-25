import {
  useNavigate,
} from 'react-router-dom'

import {
  useAuth,
} from '../auth/useAuth'


export function DashboardPage() {
  const {
    user,
    logout,
  } = useAuth()

  const navigate = useNavigate()

  async function handleLogout() {
    await logout()

    navigate(
      '/login',
      {
        replace: true,
      },
    )
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <div className="brand">
            PulseCheck
          </div>

          <p>
            Signed in as{' '}
            <strong>
              {user?.email}
            </strong>
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void handleLogout()
          }}
        >
          Sign out
        </button>
      </header>

      <section className="dashboard-placeholder">
        <p className="eyebrow">
          Authentication ready
        </p>

        <h1>
          Your dashboard
        </h1>

        <p>
          Monitor management arrives in B03.
        </p>
      </section>
    </main>
  )
}