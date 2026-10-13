import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import {
  errorMessage,
  formatDate,
  formatDateTime,
  formatDuration,
  formatLatency,
  formatNumber,
  formatPercentage,
  t,
  useLanguage,
} from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
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
import { MonitorForm } from '../monitors/MonitorForm'

import type {
  CheckResult,
  Incident,
  MetricsPeriod,
  Monitor,
  MonitorMetrics,
} from '../monitors/types'

const DETAIL_REFRESH_INTERVAL_MS = 30_000

const periods: { value: MetricsPeriod; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
]

function monitorStatusLabel(monitor: Monitor): string {
  if (!monitor.enabled) return t('Paused')

  const labels: Record<string, string> = {
    UP: 'Up',
    DEGRADED: 'Degraded',
    DOWN: 'Down',
    PAUSED: 'Paused',
  }

  return t(labels[monitor.status ?? ''] ?? 'Pending')
}

function acceptedStatusLabel(monitor: Monitor): string {
  return monitor.accepted_status_ranges.map((range) => (
    range.min === range.max
      ? String(range.min)
      : `${range.min}-${range.max}`
  )).join(', ')
}

function retentionPolicyLabel(monitor: Monitor): string {
  const labels: Record<string, string> = {
    '48_HOURS': '48 hours',
    '7_DAYS': '7 days',
    '14_DAYS': '14 days',
    '30_DAYS': '30 days',
    FOREVER: 'Forever',
  }

  return t(labels[monitor.retention_policy] ?? monitor.retention_policy)
}

function checkOutcome(check: CheckResult): string {
  return check.http_status !== null
    ? `HTTP ${check.http_status}`
    : t(check.error_type ?? 'Transport error')
}

export function MonitorDetailPage() {
  useLanguage()

  const { monitorId } = useParams()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const parsedMonitorId = Number(monitorId)
  const validMonitorId = Number.isInteger(parsedMonitorId) && parsedMonitorId > 0

  const [period, setPeriod] = useState<MetricsPeriod>('7d')
  const [monitor, setMonitor] = useState<Monitor | null>(null)
  const [metrics, setMetrics] = useState<MonitorMetrics | null>(null)
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshDetail = useCallback(async () => {
    if (!validMonitorId) return

    try {
      const [
        loadedMonitor,
        loadedMetrics,
        loadedChecks,
        loadedIncidents,
      ] = await Promise.all([
        getMonitor(parsedMonitorId),
        getMonitorMetrics(parsedMonitorId, period),
        getMonitorChecks(parsedMonitorId, 50),
        getMonitorIncidents(parsedMonitorId),
      ])

      setMonitor(loadedMonitor)
      setMetrics(loadedMetrics)
      setChecks(loadedChecks)
      setIncidents(loadedIncidents)
      setError(null)
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to load monitor details.'))
    } finally {
      setIsLoading(false)
    }
  }, [parsedMonitorId, period, validMonitorId])

  useEffect(() => {
    if (!validMonitorId) return

    const first = window.setTimeout(() => { void refreshDetail() }, 0)
    const interval = window.setInterval(
      () => { void refreshDetail() },
      DETAIL_REFRESH_INTERVAL_MS,
    )

    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [refreshDetail, validMonitorId])

  const visibleDays = useMemo(
    () => metrics?.daily.slice(-30) ?? [],
    [metrics],
  )
  const maxLatency = useMemo(
    () => Math.max(
      1,
      ...visibleDays.map((day) => day.average_response_time_ms ?? 0),
    ),
    [visibleDays],
  )

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleCheck() {
    if (!monitor) return
    setIsChecking(true)

    try {
      const response = await runMonitorCheck(monitor.id)
      setMonitor(response.monitor)
      await refreshDetail()
      setError(null)
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to check monitor.'))
    } finally {
      setIsChecking(false)
    }
  }

  async function handleToggle() {
    if (!monitor) return

    try {
      const updated = monitor.enabled
        ? await pauseMonitor(monitor.id)
        : await resumeMonitor(monitor.id)

      setMonitor(updated)
      await refreshDetail()
      setError(null)
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to update monitor.'))
    }
  }

  async function handleDelete() {
    if (!monitor) return

    if (!window.confirm(t('Delete "{name}"?', { name: monitor.name }))) return

    try {
      await deleteMonitor(monitor.id)
      navigate('/dashboard', { replace: true })
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to delete monitor.'))
    }
  }

  if (!validMonitorId) {
    return (
      <main className="monitor-detail-shell">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/dashboard')}
        >
          ← {t('Back to dashboard')}
        </button>
        <div className="detail-error-card">
          <h1>{t('Monitor unavailable')}</h1>
          <p>{t('Invalid monitor identifier.')}</p>
        </div>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="monitor-detail-shell">
        <div className="dashboard-loading" role="status">
          {t('Loading monitor details…')}
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
          onClick={() => navigate('/dashboard')}
        >
          ← {t('Back to dashboard')}
        </button>
        <div className="detail-error-card">
          <h1>{t('Monitor unavailable')}</h1>
          <p>{error ?? t('This monitor could not be loaded.')}</p>
        </div>
      </main>
    )
  }

  const statusClass = monitor.enabled
    ? monitor.status?.toLowerCase() ?? 'pending'
    : 'paused'

  return (
    <main className="monitor-detail-shell">
      <header className="dashboard-header">
        <div className="dashboard-identity">
          <div className="brand">PulseCheck</div>
          <p>{t('Signed in as')} <strong>{user?.email}</strong></p>
        </div>
        <div className="header-actions">
          <LanguageSwitcher />
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/dashboard')}
          >
            {t('Dashboard')}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => { void handleLogout() }}
          >
            {t('Sign out')}
          </button>
        </div>
      </header>

      <section className="detail-heading">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/dashboard')}
        >
          ← {t('Back to monitors')}
        </button>

        <div className="detail-title-row">
          <div>
            <div className="monitor-title-row">
              <h1>{monitor.name}</h1>
              <span className={`monitor-status monitor-status--${statusClass}`}>
                {monitorStatusLabel(monitor)}
              </span>
            </div>
            <p className="detail-url">{monitor.url}</p>
          </div>

          <div className="detail-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!monitor.enabled || isChecking}
              onClick={() => { void handleCheck() }}
            >
              {t(isChecking ? 'Checking…' : 'Check now')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsEditing((current) => !current)}
            >
              {t(isEditing ? 'Close edit' : 'Edit')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => { void handleToggle() }}
            >
              {t(monitor.enabled ? 'Pause' : 'Resume')}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => { void handleDelete() }}
            >
              {t('Delete')}
            </button>
          </div>
        </div>
      </section>

      {error && <p className="form-error dashboard-error" role="alert">{error}</p>}

      {isEditing && (
        <MonitorForm
          key={monitor.id}
          monitor={monitor}
          onSaved={(saved) => {
            setMonitor(saved)
            setIsEditing(false)
            void refreshDetail()
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">{t('Performance')}</p>
            <h2>{t('Monitor health')}</h2>
          </div>

          <div className="period-selector" aria-label={t('Metrics period')}>
            {periods.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  period === option.value
                    ? 'period-button period-button--active'
                    : 'period-button'
                }
                onClick={() => setPeriod(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="detail-metrics-grid">
          <article className="overview-card">
            <span className="overview-label">{t('Uptime')}</span>
            <strong className="overview-value">
              {formatPercentage(metrics?.uptime.percentage ?? null)}
            </strong>
            <span className="overview-detail">
              {metrics
                ? `${formatDuration(metrics.uptime.downtime_seconds)} ${t('downtime')}`
                : t('No metrics')}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">{t('Avg response')}</span>
            <strong className="overview-value">
              {formatLatency(metrics?.latency.average_ms ?? null)}
            </strong>
            <span className="overview-detail">
              {metrics
                ? `${formatLatency(metrics.latency.min_ms)} min · ${formatLatency(metrics.latency.max_ms)} max`
                : t('No metrics')}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">{t('Check success')}</span>
            <strong className="overview-value">
              {formatPercentage(metrics?.checks.success_percentage ?? null)}
            </strong>
            <span className="overview-detail">
              {metrics
                ? `${formatNumber(metrics.checks.successful)} ${t('successful')} · ${formatNumber(metrics.checks.failed)} ${t('failed')}`
                : t('No metrics')}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">{t('Incidents')}</span>
            <strong
              className={
                (metrics?.incidents.open_count ?? 0) > 0
                  ? 'overview-value overview-value--danger'
                  : 'overview-value'
              }
            >
              {metrics ? formatNumber(metrics.incidents.count) : '—'}
            </strong>
            <span className="overview-detail">
              {metrics
                ? `${formatNumber(metrics.incidents.open_count)} ${t('currently open')}`
                : t('No metrics')}
            </span>
          </article>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">{t('History')}</p>
            <h2>{t('Historical performance')}</h2>
            <p className="section-description">
              {t('Daily availability and response-time aggregates for the selected period.')}
            </p>
          </div>
        </div>

        {visibleDays.length === 0 ? (
          <div className="detail-empty">
            {t('Historical data will appear after checks have been collected.')}
          </div>
        ) : (
          <div className="history-grid">
            <article className="history-card">
              <div className="history-card-header">
                <div>
                  <h3>{t('Daily uptime')}</h3>
                  <p>{t('Confirmed incident downtime only.')}</p>
                </div>
              </div>

              <div className="history-chart">
                {visibleDays.map((day) => (
                  <div
                    key={day.date}
                    className="history-column"
                    title={`${day.date}: ${formatPercentage(day.uptime_percentage)}`}
                  >
                    <div className="history-track">
                      <div
                        className="history-bar history-bar--uptime"
                        style={{ height: `${day.uptime_percentage ?? 0}%` }}
                      />
                    </div>
                    <span>{formatDate(day.date)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="history-card">
              <div className="history-card-header">
                <div>
                  <h3>{t('Average response')}</h3>
                  <p>{t('Daily mean response latency.')}</p>
                </div>
              </div>

              <div className="history-chart">
                {visibleDays.map((day) => {
                  const value = day.average_response_time_ms ?? 0
                  const height = value / maxLatency * 100

                  return (
                    <div
                      key={day.date}
                      className="history-column"
                      title={`${day.date}: ${formatLatency(day.average_response_time_ms)}`}
                    >
                      <div className="history-track">
                        <div
                          className="history-bar history-bar--latency"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span>{formatDate(day.date)}</span>
                    </div>
                  )
                })}
              </div>
            </article>
          </div>
        )}

        {metrics && metrics.daily.length > 30 && (
          <p className="history-note">
            {t('Chart shows the latest 30 daily buckets in the selected period. Summary metrics still cover the complete period.')}
          </p>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">{t('Configuration')}</p>
            <h2>{t('Monitor settings')}</h2>
          </div>
        </div>

        <div className="configuration-grid">
          {([
            ['Last checked', formatDateTime(monitor.last_checked_at)],
            ['Next check', monitor.enabled
              ? formatDateTime(monitor.next_check_at)
              : t('Paused')],
            ['Interval', `${monitor.interval_seconds}s`],
            ['Timeout', `${monitor.timeout_seconds}s`],
            ['Failure threshold', `${monitor.failure_threshold} ${t('checks')}`],
            ['Recovery threshold', `${monitor.recovery_threshold} ${t('checks')}`],
            ['Accepted statuses', acceptedStatusLabel(monitor)],
            ['Redirects', t(monitor.follow_redirects ? 'Follow' : 'Do not follow')],
            ['Raw retention', retentionPolicyLabel(monitor)],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <span>{t(label)}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">{t('Checks')}</p>
            <h2>{t('Recent raw checks')}</h2>
            <p className="section-description">
              {t('The latest retained HTTP observations for this monitor.')}
            </p>
          </div>
          <span className="monitor-count">{formatNumber(checks.length)}</span>
        </div>

        {checks.length === 0 ? (
          <div className="detail-empty">
            {t('No retained checks yet.')}
          </div>
        ) : (
          <div className="detail-table-wrapper">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>{t('Result')}</th>
                  <th>{t('Outcome')}</th>
                  <th>{t('Response')}</th>
                  <th>{t('Checked')}</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.id}>
                    <td>
                      <span className={`result-badge result-badge--${check.result.toLowerCase()}`}>
                        {t(check.result)}
                      </span>
                    </td>
                    <td>{checkOutcome(check)}</td>
                    <td>{formatLatency(check.response_time_ms)}</td>
                    <td>{formatDateTime(check.checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-header">
          <div>
            <p className="eyebrow">{t('Incidents')}</p>
            <h2>{t('Incident history')}</h2>
            <p className="section-description">
              {t('Confirmed downtime created by the monitor state engine.')}
            </p>
          </div>
          <span className="monitor-count">{formatNumber(incidents.length)}</span>
        </div>

        {incidents.length === 0 ? (
          <div className="detail-empty">
            {t('No incidents recorded.')}
          </div>
        ) : (
          <div className="incident-list">
            {incidents.slice(0, 20).map((incident: Incident) => {
              const open = incident.resolved_at === null

              return (
                <article key={incident.id} className="incident-card">
                  <div>
                    <span className={
                      open
                        ? 'incident-status incident-status--open'
                        : 'incident-status incident-status--resolved'
                    }>
                      {t(open ? 'Open' : 'Resolved')}
                    </span>
                    <h3>{t(open ? 'Ongoing outage' : 'Resolved outage')}</h3>
                  </div>

                  <div className="incident-meta">
                    <div>
                      <span>{t('Started')}</span>
                      <strong>{formatDateTime(incident.started_at)}</strong>
                    </div>
                    <div>
                      <span>{t('Resolved at')}</span>
                      <strong>{formatDateTime(incident.resolved_at)}</strong>
                    </div>
                    <div>
                      <span>{t('Duration')}</span>
                      <strong>{formatDuration(incident.duration_seconds)}</strong>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {incidents.length > 20 && (
          <p className="history-note">
            {t('Showing the 20 most recent incidents.')}
          </p>
        )}
      </section>
    </main>
  )
}