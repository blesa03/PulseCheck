import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useNavigate,
  useParams,
} from 'react-router-dom'

import {
  ApiError,
} from '../api/client'

import {
  useAuth,
} from '../auth/useAuth'

import {
  deleteMonitor,
  getMonitor,
  getMonitorChecks,
  getMonitorIncidents,
  getMonitorMetrics,
  pauseMonitor,
  resumeMonitor,
  runMonitorCheck,
} from '../monitors/api'

import {
  MonitorForm,
} from '../monitors/MonitorForm'

import type {
  CheckResult,
  Incident,
  MetricsPeriod,
  Monitor,
  MonitorMetrics,
} from '../monitors/types'


const DETAIL_REFRESH_INTERVAL_MS =
  30_000


const periods: {
  value: MetricsPeriod
  label: string
}[] = [
  {
    value: '24h',
    label: '24 hours',
  },
  {
    value: '7d',
    label: '7 days',
  },
  {
    value: '30d',
    label: '30 days',
  },
  {
    value: 'all',
    label: 'All time',
  },
]


function monitorStatusLabel(
  monitor: Monitor,
) {
  if (!monitor.enabled) {
    return 'Paused'
  }

  switch (monitor.status) {
    case 'UP':
      return 'Up'

    case 'DEGRADED':
      return 'Degraded'

    case 'DOWN':
      return 'Down'

    case 'PAUSED':
      return 'Paused'

    default:
      return 'Pending'
  }
}


function formatPercentage(
  value: number | null,
) {
  if (value === null) {
    return '—'
  }

  return `${value.toFixed(2)}%`
}


function formatLatency(
  value: number | null,
) {
  if (value === null) {
    return '—'
  }

  return `${Math.round(value)} ms`
}


function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date)
}


function formatDate(
  value: string,
) {
  const date = new Date(
    `${value}T00:00:00`,
  )

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: 'short',
      day: 'numeric',
    },
  ).format(date)
}


function formatDuration(
  seconds: number,
) {
  if (seconds < 60) {
    return `${seconds}s`
  }

  if (seconds < 3600) {
    const minutes =
      Math.floor(seconds / 60)

    const remaining =
      seconds % 60

    return remaining
      ? `${minutes}m ${remaining}s`
      : `${minutes}m`
  }

  if (seconds < 86400) {
    const hours =
      Math.floor(
        seconds / 3600,
      )

    const minutes =
      Math.floor(
        (
          seconds
          % 3600
        )
        / 60,
      )

    return minutes
      ? `${hours}h ${minutes}m`
      : `${hours}h`
  }

  const days =
    Math.floor(
      seconds / 86400,
    )

  const hours =
    Math.floor(
      (
        seconds
        % 86400
      )
      / 3600,
    )

  return hours
    ? `${days}d ${hours}h`
    : `${days}d`
}


function checkOutcome(
  checkResult: CheckResult,
) {
  if (
    checkResult.http_status
    !== null
  ) {
    return (
      `HTTP ${checkResult.http_status}`
    )
  }

  return (
    checkResult.error_type
    ?? 'Transport error'
  )
}


function acceptedStatusLabel(
  monitor: Monitor,
) {
  return monitor
    .accepted_status_ranges
    .map(
      (range) => (
        range.min === range.max
          ? String(range.min)
          : `${range.min}-${range.max}`
      ),
    )
    .join(', ')
}


function retentionPolicyLabel(
  monitor: Monitor,
) {
  switch (
    monitor.retention_policy
  ) {
    case '48_HOURS':
      return '48 hours'

    case '7_DAYS':
      return '7 days'

    case '14_DAYS':
      return '14 days'

    case '30_DAYS':
      return '30 days'

    case 'FOREVER':
      return 'Forever'
  }
}


export function MonitorDetailPage() {
  const {
    monitorId,
  } = useParams()

  const {
    user,
    logout,
  } = useAuth()

  const navigate =
    useNavigate()

  const parsedMonitorId =
    Number(monitorId)

  const validMonitorId =
    Number.isInteger(
      parsedMonitorId,
    )
    && parsedMonitorId > 0

  const [
    period,
    setPeriod,
  ] = useState<MetricsPeriod>(
    '7d',
  )

  const [
    monitor,
    setMonitor,
  ] = useState<Monitor | null>(
    null,
  )

  const [
    metrics,
    setMetrics,
  ] = useState<MonitorMetrics | null>(
    null,
  )

  const [
    checks,
    setChecks,
  ] = useState<CheckResult[]>([])

  const [
    incidents,
    setIncidents,
  ] = useState<Incident[]>([])

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    isChecking,
    setIsChecking,
  ] = useState(false)

  const [
    isEditing,
    setIsEditing,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const refreshDetail =
    useCallback(
      async () => {
        if (!validMonitorId) {
          return
        }

        try {
          const [
            loadedMonitor,
            loadedMetrics,
            loadedChecks,
            loadedIncidents,
          ] = await Promise.all([
            getMonitor(
              parsedMonitorId,
            ),

            getMonitorMetrics(
              parsedMonitorId,
              period,
            ),

            getMonitorChecks(
              parsedMonitorId,
              50,
            ),

            getMonitorIncidents(
              parsedMonitorId,
            ),
          ])

          setMonitor(
            loadedMonitor,
          )

          setMetrics(
            loadedMetrics,
          )

          setChecks(
            loadedChecks,
          )

          setIncidents(
            loadedIncidents,
          )

          setError(null)
        } catch (caughtError) {
          setError(
            caughtError
              instanceof ApiError
              ? caughtError.message
              : (
                  'Unable to load '
                  + 'monitor details.'
                ),
          )
        } finally {
          setIsLoading(false)
        }
      },
      [
        parsedMonitorId,
        period,
        validMonitorId,
      ],
    )

  useEffect(() => {
    if (!validMonitorId) {
        return
    }

    const initialRefreshId =
        window.setTimeout(
        () => {
            void refreshDetail()
        },
        0,
        )

    const intervalId =
        window.setInterval(
        () => {
            void refreshDetail()
        },
        DETAIL_REFRESH_INTERVAL_MS,
        )

    return () => {
        window.clearTimeout(
        initialRefreshId,
        )

        window.clearInterval(
        intervalId,
        )
    }
  }, [
    refreshDetail,
    validMonitorId,
  ])

  const visibleDays =
    useMemo(
      () => (
        metrics?.daily.slice(
          -30,
        )
        ?? []
      ),
      [metrics],
    )

  const maxLatency =
    useMemo(
      () => (
        Math.max(
          1,
          ...visibleDays.map(
            (day) => (
              day.average_response_time_ms
              ?? 0
            ),
          ),
        )
      ),
      [visibleDays],
    )

  async function handleLogout() {
    await logout()

    navigate(
      '/login',
      {
        replace: true,
      },
    )
  }

  async function handleCheck() {
    if (!monitor) {
      return
    }

    setIsChecking(true)

    try {
      const response =
        await runMonitorCheck(
          monitor.id,
        )

      setMonitor(
        response.monitor,
      )

      await refreshDetail()

      setError(null)
    } catch (caughtError) {
      setError(
        caughtError
          instanceof ApiError
          ? caughtError.message
          : 'Unable to check monitor.',
      )
    } finally {
      setIsChecking(false)
    }
  }

  async function handleToggle() {
    if (!monitor) {
      return
    }

    try {
      const updated =
        monitor.enabled
          ? await pauseMonitor(
              monitor.id,
            )
          : await resumeMonitor(
              monitor.id,
            )

      setMonitor(updated)

      await refreshDetail()

      setError(null)
    } catch (caughtError) {
      setError(
        caughtError
          instanceof ApiError
          ? caughtError.message
          : (
              'Unable to update '
              + 'monitor.'
            ),
      )
    }
  }

  async function handleDelete() {
    if (!monitor) {
      return
    }

    const confirmed =
      window.confirm(
        `Delete "${monitor.name}"?`,
      )

    if (!confirmed) {
      return
    }

    try {
      await deleteMonitor(
        monitor.id,
      )

      navigate(
        '/dashboard',
        {
          replace: true,
        },
      )
    } catch (caughtError) {
      setError(
        caughtError
          instanceof ApiError
          ? caughtError.message
          : 'Unable to delete monitor.',
      )
    }
  }

  if (!validMonitorId) {
    return (
      <main className="monitor-detail-shell">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            navigate('/dashboard')
          }}
        >
          ← Back to dashboard
        </button>

        <div className="detail-error-card">
          <h1>
            Monitor unavailable
          </h1>

          <p>
            Invalid monitor identifier.
          </p>
        </div>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="monitor-detail-shell">
        <div className="dashboard-loading">
          Loading monitor details…
        </div>
      </main>
    )
  }

  if (!monitor) {
    return (
      <main className="monitor-detail-shell">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            navigate('/dashboard')
          }}
        >
          ← Back to dashboard
        </button>

        <div className="detail-error-card">
          <h1>
            Monitor unavailable
          </h1>

          <p>
            {error
              ?? (
                'This monitor could '
                + 'not be loaded.'
              )}
          </p>
        </div>
      </main>
    )
  }

  const status =
    monitorStatusLabel(
      monitor,
    )

  const statusClass =
    status.toLowerCase()

  return (
    <main className="monitor-detail-shell">
      <header className="dashboard-header">
        <div className="dashboard-identity">
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
            className="secondary-button"
            onClick={() => {
              navigate(
                '/dashboard',
              )
            }}
          >
            Dashboard
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

      <section className="detail-heading">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            navigate('/dashboard')
          }}
        >
          ← Back to monitors
        </button>

        <div className="detail-title-row">
          <div>
            <div className="monitor-title-row">
              <h1>
                {monitor.name}
              </h1>

              <span
                className={
                  `monitor-status monitor-status--${statusClass}`
                }
              >
                {status}
              </span>
            </div>

            <p className="detail-url">
              {monitor.url}
            </p>
          </div>

          <div className="detail-actions">
            <button
              type="button"
              className="primary-button"
              disabled={
                !monitor.enabled
                || isChecking
              }
              onClick={() => {
                void handleCheck()
              }}
            >
              {isChecking
                ? 'Checking…'
                : 'Check now'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setIsEditing(
                  (current) => (
                    !current
                  ),
                )
              }}
            >
              {isEditing
                ? 'Close edit'
                : 'Edit'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void handleToggle()
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
                void handleDelete()
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p
          className="form-error dashboard-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {isEditing && (
        <MonitorForm
          key={monitor.id}
          monitor={monitor}
          onSaved={(
            savedMonitor,
          ) => {
            setMonitor(
              savedMonitor,
            )

            setIsEditing(false)

            void refreshDetail()
          }}
          onCancel={() => {
            setIsEditing(false)
          }}
        />
      )}

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">
              Performance
            </p>

            <h2>
              Monitor health
            </h2>
          </div>

          <div
            className="period-selector"
            aria-label="Metrics period"
          >
            {periods.map(
              (option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    period
                    === option.value
                      ? (
                          'period-button '
                          + 'period-button--active'
                        )
                      : 'period-button'
                  }
                  onClick={() => {
                    setPeriod(
                      option.value,
                    )
                  }}
                >
                  {option.label}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="detail-metrics-grid">
          <article className="overview-card">
            <span className="overview-label">
              Uptime
            </span>

            <strong className="overview-value">
              {formatPercentage(
                metrics?.uptime
                  .percentage
                ?? null,
              )}
            </strong>

            <span className="overview-detail">
              {metrics
                ? (
                    `${formatDuration(
                      metrics.uptime
                        .downtime_seconds,
                    )} downtime`
                  )
                : 'No metrics'}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">
              Avg response
            </span>

            <strong className="overview-value">
              {formatLatency(
                metrics?.latency
                  .average_ms
                ?? null,
              )}
            </strong>

            <span className="overview-detail">
              {metrics
                ? (
                    `${formatLatency(
                      metrics.latency
                        .min_ms,
                    )} min · ${
                      formatLatency(
                        metrics.latency
                          .max_ms,
                      )
                    } max`
                  )
                : 'No metrics'}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">
              Check success
            </span>

            <strong className="overview-value">
              {formatPercentage(
                metrics?.checks
                  .success_percentage
                ?? null,
              )}
            </strong>

            <span className="overview-detail">
              {metrics
                ? (
                    `${metrics.checks.successful}`
                    + ' successful · '
                    + `${metrics.checks.failed}`
                    + ' failed'
                  )
                : 'No metrics'}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">
              Incidents
            </span>

            <strong
              className={
                (
                  metrics?.incidents
                    .open_count
                  ?? 0
                ) > 0
                  ? (
                      'overview-value '
                      + 'overview-value--danger'
                    )
                  : 'overview-value'
              }
            >
              {metrics?.incidents
                .count
                ?? '—'}
            </strong>

            <span className="overview-detail">
              {metrics
                ? (
                    `${metrics.incidents.open_count}`
                    + ' currently open'
                  )
                : 'No metrics'}
            </span>
          </article>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">
              History
            </p>

            <h2>
              Historical performance
            </h2>

            <p className="section-description">
              Daily availability and
              response-time aggregates for
              the selected period.
            </p>
          </div>
        </div>

        {visibleDays.length === 0 ? (
          <div className="detail-empty">
            Historical data will appear
            after checks have been
            collected.
          </div>
        ) : (
          <div className="history-grid">
            <article className="history-card">
              <div className="history-card-header">
                <div>
                  <h3>
                    Daily uptime
                  </h3>

                  <p>
                    Confirmed incident
                    downtime only.
                  </p>
                </div>
              </div>

              <div className="history-chart">
                {visibleDays.map(
                  (day) => (
                    <div
                      key={day.date}
                      className="history-column"
                      title={
                        `${day.date}: `
                        + `${formatPercentage(
                          day.uptime_percentage,
                        )}`
                      }
                    >
                      <div className="history-track">
                        <div
                          className="history-bar history-bar--uptime"
                          style={{
                            height:
                              `${
                                day.uptime_percentage
                                ?? 0
                              }%`,
                          }}
                        />
                      </div>

                      <span>
                        {formatDate(
                          day.date,
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </article>

            <article className="history-card">
              <div className="history-card-header">
                <div>
                  <h3>
                    Average response
                  </h3>

                  <p>
                    Daily mean response
                    latency.
                  </p>
                </div>
              </div>

              <div className="history-chart">
                {visibleDays.map(
                  (day) => {
                    const value =
                      day.average_response_time_ms
                      ?? 0

                    const height =
                      (
                        value
                        / maxLatency
                      )
                      * 100

                    return (
                      <div
                        key={day.date}
                        className="history-column"
                        title={
                          `${day.date}: `
                          + formatLatency(
                            day.average_response_time_ms,
                          )
                        }
                      >
                        <div className="history-track">
                          <div
                            className="history-bar history-bar--latency"
                            style={{
                              height:
                                `${height}%`,
                            }}
                          />
                        </div>

                        <span>
                          {formatDate(
                            day.date,
                          )}
                        </span>
                      </div>
                    )
                  },
                )}
              </div>
            </article>
          </div>
        )}

        {metrics
          && metrics.daily.length > 30
          && (
            <p className="history-note">
              Chart shows the latest 30
              daily buckets in the selected
              period. Summary metrics still
              cover the complete period.
            </p>
          )}
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">
              Configuration
            </p>

            <h2>
              Monitor settings
            </h2>
          </div>
        </div>

        <div className="configuration-grid">
          <div>
            <span>
              Last checked
            </span>

            <strong>
              {formatDateTime(
                monitor.last_checked_at,
              )}
            </strong>
          </div>

          <div>
            <span>
              Next check
            </span>

            <strong>
              {monitor.enabled
                ? formatDateTime(
                    monitor.next_check_at,
                  )
                : 'Paused'}
            </strong>
          </div>

          <div>
            <span>
              Interval
            </span>

            <strong>
              {monitor.interval_seconds}s
            </strong>
          </div>

          <div>
            <span>
              Timeout
            </span>

            <strong>
              {monitor.timeout_seconds}s
            </strong>
          </div>

          <div>
            <span>
              Failure threshold
            </span>

            <strong>
              {monitor.failure_threshold}
              {' '}checks
            </strong>
          </div>

          <div>
            <span>
              Recovery threshold
            </span>

            <strong>
              {monitor.recovery_threshold}
              {' '}checks
            </strong>
          </div>

          <div>
            <span>
              Accepted statuses
            </span>

            <strong>
              {acceptedStatusLabel(
                monitor,
              )}
            </strong>
          </div>

          <div>
            <span>
              Redirects
            </span>

            <strong>
              {monitor.follow_redirects
                ? 'Follow'
                : 'Do not follow'}
            </strong>
          </div>

          <div>
            <span>
              Raw retention
            </span>

            <strong>
              {retentionPolicyLabel(
                monitor,
              )}
            </strong>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">
              Checks
            </p>

            <h2>
              Recent raw checks
            </h2>

            <p className="section-description">
              The latest retained HTTP
              observations for this monitor.
            </p>
          </div>

          <span className="monitor-count">
            {checks.length}
          </span>
        </div>

        {checks.length === 0 ? (
          <div className="detail-empty">
            No retained checks yet.
          </div>
        ) : (
          <div className="detail-table-wrapper">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>
                    Result
                  </th>

                  <th>
                    Outcome
                  </th>

                  <th>
                    Response
                  </th>

                  <th>
                    Checked
                  </th>
                </tr>
              </thead>

              <tbody>
                {checks.map(
                  (check) => (
                    <tr key={check.id}>
                      <td>
                        <span
                          className={
                            (
                              'result-badge '
                              + `result-badge--${
                                check.result
                                  .toLowerCase()
                              }`
                            )
                          }
                        >
                          {check.result}
                        </span>
                      </td>

                      <td>
                        {checkOutcome(
                          check,
                        )}
                      </td>

                      <td>
                        {check
                          .response_time_ms}
                        {' '}ms
                      </td>

                      <td>
                        {formatDateTime(
                          check.checked_at,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">
              Incidents
            </p>

            <h2>
              Incident history
            </h2>

            <p className="section-description">
              Confirmed downtime created by
              the monitor state engine.
            </p>
          </div>

          <span className="monitor-count">
            {incidents.length}
          </span>
        </div>

        {incidents.length === 0 ? (
          <div className="detail-empty">
            No incidents recorded.
          </div>
        ) : (
          <div className="incident-list">
            {incidents
              .slice(0, 20)
              .map(
                (incident) => {
                  const open =
                    incident.resolved_at
                    === null

                  return (
                    <article
                      key={incident.id}
                      className="incident-card"
                    >
                      <div>
                        <span
                          className={
                            open
                              ? (
                                  'incident-status '
                                  + 'incident-status--open'
                                )
                              : (
                                  'incident-status '
                                  + 'incident-status--resolved'
                                )
                          }
                        >
                          {open
                            ? 'Open'
                            : 'Resolved'}
                        </span>

                        <h3>
                          {open
                            ? 'Ongoing outage'
                            : 'Resolved outage'}
                        </h3>
                      </div>

                      <div className="incident-meta">
                        <div>
                          <span>
                            Started
                          </span>

                          <strong>
                            {formatDateTime(
                              incident
                                .started_at,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Resolved
                          </span>

                          <strong>
                            {formatDateTime(
                              incident
                                .resolved_at,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Duration
                          </span>

                          <strong>
                            {formatDuration(
                              incident
                                .duration_seconds,
                            )}
                          </strong>
                        </div>
                      </div>
                    </article>
                  )
                },
              )}
          </div>
        )}

        {incidents.length > 20 && (
          <p className="history-note">
            Showing the 20 most recent
            incidents.
          </p>
        )}
      </section>
    </main>
  )
}