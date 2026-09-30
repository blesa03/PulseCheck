import {
  useEffect,
  useMemo,
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
  getMonitorMetrics,
  listMonitors,
  pauseMonitor,
  resumeMonitor,
  runMonitorCheck,
} from '../monitors/api'

import {
  MonitorForm,
} from '../monitors/MonitorForm'

import type {
  CheckResult,
  Monitor,
  MonitorMetrics,
} from '../monitors/types'


const DASHBOARD_REFRESH_INTERVAL_MS =
  30_000


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


function checkResultLabel(
  checkResult: CheckResult,
) {
  const outcome =
    checkResult.http_status !== null
      ? `HTTP ${checkResult.http_status}`
      : checkResult.error_type
        ?? 'Transport error'

  return [
    checkResult.result,
    outcome,
    `${checkResult.response_time_ms} ms`,
  ].join(' · ')
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
    return 'Never checked'
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


function formatCheckCount(
  value: number,
) {
  return new Intl.NumberFormat()
    .format(value)
}


interface DashboardSummary {
  totalMonitors: number
  activeMonitors: number
  pausedMonitors: number

  upMonitors: number
  degradedMonitors: number
  downMonitors: number
  pendingMonitors: number

  uptime: number | null
  averageLatency: number | null

  totalChecks: number
  openIncidents: number
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
    metricsByMonitor,
    setMetricsByMonitor,
  ] = useState<
    Record<
      number,
      MonitorMetrics | null
    >
  >({})

  const [
    latestChecks,
    setLatestChecks,
  ] = useState<
    Record<number, CheckResult>
  >({})

  const [
    checkingMonitorIds,
    setCheckingMonitorIds,
  ] = useState<number[]>([])

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState<string | null>(null)

  const [
    metricsUnavailable,
    setMetricsUnavailable,
  ] = useState(false)

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

    async function loadDashboard(
      initialLoad: boolean,
    ) {
      if (initialLoad) {
        setIsLoading(true)
      }

      try {
        const loadedMonitors =
          await listMonitors()

        const metricResults =
          await Promise.all(
            loadedMonitors.map(
              async (monitor) => {
                try {
                  const metrics =
                    await getMonitorMetrics(
                      monitor.id,
                      '24h',
                    )

                  return {
                    id: monitor.id,
                    metrics,
                    failed: false,
                  }
                } catch {
                  return {
                    id: monitor.id,
                    metrics: null,
                    failed: true,
                  }
                }
              },
            ),
          )

        if (!active) {
          return
        }

        const nextMetrics:
          Record<
            number,
            MonitorMetrics | null
          > = {}

        let metricFailure = false

        for (
          const result
          of metricResults
        ) {
          nextMetrics[
            result.id
          ] = result.metrics

          if (result.failed) {
            metricFailure = true
          }
        }

        setMonitors(
          loadedMonitors,
        )

        setMetricsByMonitor(
          nextMetrics,
        )

        setMetricsUnavailable(
          metricFailure,
        )

        setError(null)
      } catch (caughtError) {
        if (!active) {
          return
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'Unable to load dashboard.',
        )
      } finally {
        if (
          active
          && initialLoad
        ) {
          setIsLoading(false)
        }
      }
    }

    void loadDashboard(true)

    const intervalId =
      window.setInterval(
        () => {
          void loadDashboard(
            false,
          )
        },
        DASHBOARD_REFRESH_INTERVAL_MS,
      )

    return () => {
      active = false

      window.clearInterval(
        intervalId,
      )
    }
  }, [])

  const summary =
    useMemo<DashboardSummary>(
      () => {
        const activeMonitors =
          monitors.filter(
            (monitor) => (
              monitor.enabled
            ),
          )

        const observedMetrics =
          activeMonitors
            .map(
              (monitor) => (
                metricsByMonitor[
                  monitor.id
                ]
              ),
            )
            .filter(
              (
                metrics,
              ): metrics is MonitorMetrics => (
                metrics !== null
                && metrics !== undefined
                && metrics.checks.total > 0
              ),
            )

        const allMetrics =
          monitors
            .map(
              (monitor) => (
                metricsByMonitor[
                  monitor.id
                ]
              ),
            )
            .filter(
              (
                metrics,
              ): metrics is MonitorMetrics => (
                metrics !== null
                && metrics !== undefined
              ),
            )

        const totalWindowSeconds =
          observedMetrics.reduce(
            (
              total,
              metrics,
            ) => (
              total
              + metrics.uptime
                .window_seconds
            ),
            0,
          )

        const totalDowntimeSeconds =
          observedMetrics.reduce(
            (
              total,
              metrics,
            ) => (
              total
              + metrics.uptime
                .downtime_seconds
            ),
            0,
          )

        const uptime =
          totalWindowSeconds > 0
            ? (
                (
                  totalWindowSeconds
                  - totalDowntimeSeconds
                )
                / totalWindowSeconds
              )
              * 100
            : null

        const totalChecks =
          observedMetrics.reduce(
            (
              total,
              metrics,
            ) => (
              total
              + metrics.checks.total
            ),
            0,
          )

        const latencyWeight =
          observedMetrics.reduce(
            (
              total,
              metrics,
            ) => {
              if (
                metrics.latency
                  .average_ms
                === null
              ) {
                return total
              }

              return (
                total
                + (
                  metrics.latency
                    .average_ms
                  * metrics.checks
                    .total
                )
              )
            },
            0,
          )

        const averageLatency =
          totalChecks > 0
            ? latencyWeight
              / totalChecks
            : null

        return {
          totalMonitors:
            monitors.length,

          activeMonitors:
            activeMonitors.length,

          pausedMonitors:
            monitors.filter(
              (monitor) => (
                !monitor.enabled
              ),
            ).length,

          upMonitors:
            monitors.filter(
              (monitor) => (
                monitor.enabled
                && monitor.status
                === 'UP'
              ),
            ).length,

          degradedMonitors:
            monitors.filter(
              (monitor) => (
                monitor.enabled
                && monitor.status
                === 'DEGRADED'
              ),
            ).length,

          downMonitors:
            monitors.filter(
              (monitor) => (
                monitor.enabled
                && monitor.status
                === 'DOWN'
              ),
            ).length,

          pendingMonitors:
            monitors.filter(
              (monitor) => (
                monitor.enabled
                && monitor.status
                === null
              ),
            ).length,

          uptime,

          averageLatency,

          totalChecks,

          openIncidents:
            allMetrics.reduce(
              (
                total,
                metrics,
              ) => (
                total
                + metrics.incidents
                  .open_count
              ),
              0,
            ),
        }
      },
      [
        monitors,
        metricsByMonitor,
      ],
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

  function handleSaved(
    savedMonitor: Monitor,
  ) {
    setMonitors(
      (current) => {
        const exists =
          current.some(
            ({ id }) => (
              id
              === savedMonitor.id
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

      setLatestChecks(
        (current) => {
          const next = {
            ...current,
          }

          delete next[
            monitor.id
          ]

          return next
        },
      )

      setError(null)
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Unable to update monitor.',
      )
    }
  }

  async function handleCheck(
    monitor: Monitor,
  ) {
    setCheckingMonitorIds(
      (current) => (
        current.includes(
          monitor.id,
        )
          ? current
          : [
              ...current,
              monitor.id,
            ]
      ),
    )

    try {
      const response =
        await runMonitorCheck(
          monitor.id,
        )

      const checkResult =
        response.check_result

      const updatedMonitor =
        response.monitor

      if (
        !checkResult
        || !updatedMonitor
      ) {
        throw new Error(
          'Invalid check response.',
        )
      }

      setLatestChecks(
        (current) => ({
          ...current,
          [monitor.id]:
            checkResult,
        }),
      )

      setMonitors(
        (current) => (
          current.map(
            (currentMonitor) => (
              currentMonitor.id
              === updatedMonitor.id
                ? updatedMonitor
                : currentMonitor
            ),
          )
        ),
      )

      try {
        const updatedMetrics =
          await getMonitorMetrics(
            monitor.id,
            '24h',
          )

        setMetricsByMonitor(
          (current) => ({
            ...current,
            [monitor.id]:
              updatedMetrics,
          }),
        )
      } catch {
        setMetricsUnavailable(
          true,
        )
      }

      setError(null)
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : caughtError
              instanceof Error
            ? caughtError.message
            : 'Unable to check monitor.',
      )
    } finally {
      setCheckingMonitorIds(
        (current) => (
          current.filter(
            (id) => (
              id
              !== monitor.id
            ),
          )
        ),
      )
    }
  }

  async function handleDelete(
    monitor: Monitor,
  ) {
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

      setMonitors(
        (current) => (
          current.filter(
            ({ id }) => (
              id
              !== monitor.id
            ),
          )
        ),
      )

      setLatestChecks(
        (current) => {
          const next = {
            ...current,
          }

          delete next[
            monitor.id
          ]

          return next
        },
      )

      setMetricsByMonitor(
        (current) => {
          const next = {
            ...current,
          }

          delete next[
            monitor.id
          ]

          return next
        },
      )

      setError(null)
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

      {metricsUnavailable && (
        <div
          className="dashboard-warning"
          role="status"
        >
          Some monitoring metrics could not
          be refreshed. Current monitor
          states are still available.
        </div>
      )}

      <section className="overview-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Overview
            </p>

            <h1>
              Monitoring health
            </h1>

            <p className="section-description">
              Live monitor state and
              trailing 24-hour metrics.
              Updates automatically every
              30 seconds.
            </p>
          </div>
        </div>

        <div className="overview-grid">
          <article className="overview-card">
            <span className="overview-label">
              Monitors
            </span>

            <strong className="overview-value">
              {summary.totalMonitors}
            </strong>

            <span className="overview-detail">
              {summary.activeMonitors}
              {' '}active ·{' '}
              {summary.pausedMonitors}
              {' '}paused
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">
              Uptime · 24h
            </span>

            <strong className="overview-value">
              {formatPercentage(
                summary.uptime,
              )}
            </strong>

            <span className="overview-detail">
              Weighted across active
              monitored services
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">
              Avg response · 24h
            </span>

            <strong className="overview-value">
              {formatLatency(
                summary.averageLatency,
              )}
            </strong>

            <span className="overview-detail">
              {formatCheckCount(
                summary.totalChecks,
              )}
              {' '}checks observed
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">
              Open incidents
            </span>

            <strong
              className={
                summary.openIncidents > 0
                  ? (
                      'overview-value '
                      + 'overview-value--danger'
                    )
                  : 'overview-value'
              }
            >
              {summary.openIncidents}
            </strong>

            <span className="overview-detail">
              Confirmed outages currently
              unresolved
            </span>
          </article>
        </div>

        <div className="status-breakdown">
          <span className="status-breakdown-item status-breakdown-item--up">
            {summary.upMonitors}
            {' '}up
          </span>

          <span className="status-breakdown-item status-breakdown-item--degraded">
            {summary.degradedMonitors}
            {' '}degraded
          </span>

          <span className="status-breakdown-item status-breakdown-item--down">
            {summary.downMonitors}
            {' '}down
          </span>

          <span className="status-breakdown-item status-breakdown-item--pending">
            {summary.pendingMonitors}
            {' '}pending
          </span>

          <span className="status-breakdown-item status-breakdown-item--paused">
            {summary.pausedMonitors}
            {' '}paused
          </span>
        </div>
      </section>

      <section className="monitors-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Monitoring
            </p>

            <h2>
              Your monitors
            </h2>

            <p className="section-description">
              Current health, 24-hour
              performance and monitor
              controls.
            </p>
          </div>

          {!isLoading && (
            <span className="monitor-count">
              {monitors.length}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="dashboard-loading">
            Loading monitoring data…
          </div>
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
                monitoring availability
                and response time.
              </p>
            </div>
          )}

        {!isLoading && (
          <div className="monitor-list">
            {monitors.map(
              (monitor) => {
                const status =
                  monitorStatusLabel(
                    monitor,
                  )

                const statusClass =
                  status.toLowerCase()

                const latestCheck =
                  latestChecks[
                    monitor.id
                  ]

                const checking =
                  checkingMonitorIds
                    .includes(
                      monitor.id,
                    )

                const metrics =
                  metricsByMonitor[
                    monitor.id
                  ]

                const hasObservations =
                  metrics !== null
                  && metrics !== undefined
                  && metrics.checks.total > 0

                const openIncidents =
                  metrics?.incidents
                    .open_count
                  ?? 0

                return (
                  <article
                    key={monitor.id}
                    className="monitor-card"
                  >
                    <div className="monitor-main">
                      <div className="monitor-card-header">
                        <div>
                          <div className="monitor-title-row">
                            <h3>
                              {monitor.name}
                            </h3>

                            <span
                              className={
                                `monitor-status monitor-status--${statusClass}`
                              }
                            >
                              {status}
                            </span>

                            {openIncidents > 0 && (
                              <span className="incident-indicator">
                                {openIncidents}
                                {' '}open incident
                                {openIncidents === 1
                                  ? ''
                                  : 's'}
                              </span>
                            )}
                          </div>

                          <p className="monitor-url">
                            {monitor.url}
                          </p>
                        </div>
                      </div>

                      <div className="monitor-metrics">
                        <div className="monitor-metric">
                          <span>
                            Uptime · 24h
                          </span>

                          <strong>
                            {hasObservations
                              ? formatPercentage(
                                  metrics
                                    .uptime
                                    .percentage,
                                )
                              : '—'}
                          </strong>
                        </div>

                        <div className="monitor-metric">
                          <span>
                            Avg response
                          </span>

                          <strong>
                            {hasObservations
                              ? formatLatency(
                                  metrics
                                    .latency
                                    .average_ms,
                                )
                              : '—'}
                          </strong>
                        </div>

                        <div className="monitor-metric">
                          <span>
                            Checks · 24h
                          </span>

                          <strong>
                            {hasObservations
                              ? formatCheckCount(
                                  metrics
                                    .checks
                                    .total,
                                )
                              : '—'}
                          </strong>
                        </div>

                        <div className="monitor-metric">
                          <span>
                            Check success
                          </span>

                          <strong>
                            {hasObservations
                              ? formatPercentage(
                                  metrics
                                    .checks
                                    .success_percentage,
                                )
                              : '—'}
                          </strong>
                        </div>
                      </div>

                      <div className="monitor-details">
                        <div>
                          <span>
                            Last checked
                          </span>

                          <strong>
                            {formatDateTime(
                              monitor
                                .last_checked_at,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Interval
                          </span>

                          <strong>
                            {monitor
                              .interval_seconds}
                            s
                          </strong>
                        </div>

                        <div>
                          <span>
                            Timeout
                          </span>

                          <strong>
                            {monitor
                              .timeout_seconds}
                            s
                          </strong>
                        </div>

                        <div>
                          <span>
                            Thresholds
                          </span>

                          <strong>
                            {monitor
                              .failure_threshold}
                            {' '}↓ /{' '}
                            {monitor
                              .recovery_threshold}
                            {' '}↑
                          </strong>
                        </div>
                      </div>

                      {metrics === null && (
                        <p className="monitor-metrics-unavailable">
                          Metrics are temporarily
                          unavailable for this
                          monitor.
                        </p>
                      )}

                      {metrics === undefined && (
                        <p className="monitor-metrics-pending">
                          Metrics will appear after
                          the next dashboard
                          refresh.
                        </p>
                      )}

                      {latestCheck?.result && (
                        <div
                          className={
                            `raw-check raw-check--${latestCheck.result.toLowerCase()}`
                          }
                        >
                          <span>
                            Latest manual check
                          </span>

                          <strong>
                            {checkResultLabel(
                              latestCheck,
                            )}
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className="monitor-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          navigate(
                            `/monitors/${monitor.id}`,
                          )
                        }}
                      >
                        Details
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          !monitor.enabled
                          || checking
                        }
                        onClick={() => {
                          void handleCheck(
                            monitor,
                          )
                        }}
                      >
                        {checking
                          ? 'Checking…'
                          : 'Check now'}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setShowCreateForm(
                            false,
                          )

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
        )}
      </section>
    </main>
  )
}