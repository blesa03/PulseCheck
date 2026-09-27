import {
  useEffect,
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  ApiError,
} from '../api/client'

import {
  useAuth,
} from '../auth/useAuth'

import {
  deleteMonitor,
  listMonitors,
  pauseMonitor,
  resumeMonitor,
} from '../monitors/api'

import {
  MonitorForm,
} from '../monitors/MonitorForm'

import type {
  Monitor,
} from '../monitors/types'


function monitorStatusLabel(
  monitor: Monitor,
) {
  if (!monitor.enabled) {
    return 'Paused'
  }

  if (monitor.status === null) {
    return 'Pending'
  }

  return {
    UP: 'Up',
    DEGRADED: 'Degraded',
    DOWN: 'Down',
    PAUSED: 'Paused',
  }[monitor.status]
}


export function DashboardPage() {
  const {
    user,
    logout,
  } = useAuth()

  const navigate = useNavigate()

  const [
    monitors,
    setMonitors,
  ] = useState<Monitor[]>([])

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState<string | null>(null)

  const [
    showCreateForm,
    setShowCreateForm,
  ] = useState(false)

  const [
    editingMonitor,
    setEditingMonitor,
  ] = useState<Monitor | null>(null)

  useEffect(() => {
    let active = true

    void listMonitors()
      .then((result) => {
        if (active) {
          setMonitors(result)
          setError(null)
        }
      })
      .catch((caughtError) => {
        if (!active) {
          return
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'Unable to load monitors.',
        )
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleLogout() {
    await logout()

    navigate(
      '/login',
      {
        replace: true,
      },
    )
  }

  function handleSaved(
    savedMonitor: Monitor,
  ) {
    setMonitors(
      (current) => {
        const exists = current.some(
          ({ id }) => (
            id === savedMonitor.id
          ),
        )

        if (exists) {
          return current.map(
            (monitor) => (
              monitor.id
              === savedMonitor.id
                ? savedMonitor
                : monitor
            ),
          )
        }

        return [
          savedMonitor,
          ...current,
        ]
      },
    )

    setEditingMonitor(null)
    setShowCreateForm(false)
  }

  async function handleToggle(
    monitor: Monitor,
  ) {
    try {
      const updated =
        monitor.enabled
          ? await pauseMonitor(
              monitor.id,
            )
          : await resumeMonitor(
              monitor.id,
            )

      handleSaved(updated)
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Unable to update monitor.',
      )
    }
  }

  async function handleDelete(
    monitor: Monitor,
  ) {
    const confirmed = window.confirm(
      `Delete "${monitor.name}"?`,
    )

    if (!confirmed) {
      return
    }

    try {
      await deleteMonitor(
        monitor.id,
      )

      setMonitors(
        (current) => (
          current.filter(
            ({ id }) => (
              id !== monitor.id
            ),
          )
        ),
      )
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Unable to delete monitor.',
      )
    }
  }

  const formMonitor =
    editingMonitor

  const formVisible =
    showCreateForm
    || editingMonitor !== null

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

        <div className="header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setEditingMonitor(null)
              setShowCreateForm(true)
            }}
          >
            Add monitor
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void handleLogout()
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {formVisible && (
        <MonitorForm
          key={
            formMonitor?.id
            ?? 'new-monitor'
          }
          monitor={formMonitor}
          onSaved={handleSaved}
          onCancel={() => {
            setEditingMonitor(null)
            setShowCreateForm(false)
          }}
        />
      )}

      {error && (
        <p
          className="form-error dashboard-error"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="monitors-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Monitoring
            </p>

            <h1>
              Your monitors
            </h1>
          </div>

          {!isLoading && (
            <span className="monitor-count">
              {monitors.length}
            </span>
          )}
        </div>

        {isLoading && (
          <p className="muted">
            Loading monitors…
          </p>
        )}

        {!isLoading
          && monitors.length === 0
          && (
            <div className="empty-state">
              <h2>
                No monitors yet
              </h2>

              <p>
                Add your first HTTP
                service to start
                configuring PulseCheck.
              </p>
            </div>
          )}

        <div className="monitor-list">
          {monitors.map(
            (monitor) => {
              const status =
                monitorStatusLabel(
                  monitor,
                )

              return (
                <article
                  key={monitor.id}
                  className="monitor-card"
                >
                  <div className="monitor-main">
                    <div>
                      <div className="monitor-title-row">
                        <h2>
                          {monitor.name}
                        </h2>

                        <span
                          className={
                            `monitor-status monitor-status--${
                              status.toLowerCase()
                            }`
                          }
                        >
                          {status}
                        </span>
                      </div>

                      <p className="monitor-url">
                        {monitor.url}
                      </p>
                    </div>

                    <div className="monitor-meta">
                      <span>
                        Every{' '}
                        {monitor.interval_seconds}
                        s
                      </span>

                      <span>
                        Timeout{' '}
                        {monitor.timeout_seconds}
                        s
                      </span>

                      <span>
                        Down after{' '}
                        {monitor.failure_threshold}
                        {' '}failure(s)
                      </span>

                      <span>
                        Recover after{' '}
                        {monitor.recovery_threshold}
                        {' '}success(es)
                      </span>
                    </div>
                  </div>

                  <div className="monitor-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setShowCreateForm(false)
                        setEditingMonitor(
                          monitor,
                        )
                      }}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void handleToggle(
                          monitor,
                        )
                      }}
                    >
                      {monitor.enabled
                        ? 'Pause'
                        : 'Resume'}
                    </button>

                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        void handleDelete(
                          monitor,
                        )
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )
            },
          )}
        </div>
      </section>
    </main>
  )
}