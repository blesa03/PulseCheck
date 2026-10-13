import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import {
  errorMessage,
  formatDateTime,
  formatLatency,
  formatNumber,
  formatPercentage,
  t,
  useLanguage,
} from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import {
  deleteMonitor,
  getMonitorMetrics,
  listMonitors,
  pauseMonitor,
  resumeMonitor,
  runMonitorCheck,
} from '../monitors/api'
import { MonitorForm } from '../monitors/MonitorForm'

import type { CheckResult, Monitor, MonitorMetrics } from '../monitors/types'

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000

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

function checkResultLabel(check: CheckResult): string {
  const outcome = check.http_status !== null
    ? `HTTP ${check.http_status}`
    : t(check.error_type ?? 'Transport error')

  return `${t(check.result)} · ${outcome} · ${formatLatency(check.response_time_ms)}`
}

export function DashboardPage() {
  useLanguage()

  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [metricsByMonitor, setMetricsByMonitor] =
    useState<Record<number, MonitorMetrics | null>>({})
  const [latestChecks, setLatestChecks] =
    useState<Record<number, CheckResult>>({})
  const [checkingIds, setCheckingIds] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metricsUnavailable, setMetricsUnavailable] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null)

  useEffect(() => {
    let active = true

    async function loadDashboard(initialLoad: boolean) {
      if (initialLoad) setIsLoading(true)

      try {
        const loadedMonitors = await listMonitors()
        const results = await Promise.all(
          loadedMonitors.map(async (monitor) => {
            try {
              const metrics = await getMonitorMetrics(monitor.id, '24h')
              return { id: monitor.id, metrics, failed: false }
            } catch {
              return { id: monitor.id, metrics: null, failed: true }
            }
          }),
        )

        if (!active) return

        const nextMetrics: Record<number, MonitorMetrics | null> = {}
        for (const result of results) {
          nextMetrics[result.id] = result.metrics
        }

        setMonitors(loadedMonitors)
        setMetricsByMonitor(nextMetrics)
        setMetricsUnavailable(results.some((result) => result.failed))
        setError(null)
      } catch (caughtError) {
        if (active) setError(errorMessage(caughtError, 'Unable to load dashboard.'))
      } finally {
        if (active && initialLoad) setIsLoading(false)
      }
    }

    void loadDashboard(true)
    const interval = window.setInterval(
      () => { void loadDashboard(false) },
      DASHBOARD_REFRESH_INTERVAL_MS,
    )

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const summary = useMemo(() => {
    const active = monitors.filter((monitor) => monitor.enabled)
    const observed = active
      .map((monitor) => metricsByMonitor[monitor.id])
      .filter(
        (metrics): metrics is MonitorMetrics =>
          metrics != null && metrics.checks.total > 0,
      )
    const allMetrics = monitors
      .map((monitor) => metricsByMonitor[monitor.id])
      .filter((metrics): metrics is MonitorMetrics => metrics != null)

    const totalWindow = observed.reduce(
      (total, metrics) => total + metrics.uptime.window_seconds, 0,
    )
    const totalDowntime = observed.reduce(
      (total, metrics) => total + metrics.uptime.downtime_seconds, 0,
    )
    const totalChecks = observed.reduce(
      (total, metrics) => total + metrics.checks.total, 0,
    )
    const latencyWeight = observed.reduce(
      (total, metrics) =>
        total + (metrics.latency.average_ms ?? 0) * metrics.checks.total,
      0,
    )

    return {
      total: monitors.length,
      active: active.length,
      paused: monitors.filter((monitor) => !monitor.enabled).length,
      up: active.filter((monitor) => monitor.status === 'UP').length,
      degraded: active.filter((monitor) => monitor.status === 'DEGRADED').length,
      down: active.filter((monitor) => monitor.status === 'DOWN').length,
      pending: active.filter((monitor) => monitor.status === null).length,
      uptime: totalWindow > 0
        ? (totalWindow - totalDowntime) / totalWindow * 100
        : null,
      latency: totalChecks > 0 ? latencyWeight / totalChecks : null,
      totalChecks,
      openIncidents: allMetrics.reduce(
        (total, metrics) => total + metrics.incidents.open_count, 0,
      ),
    }
  }, [monitors, metricsByMonitor])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function handleSaved(saved: Monitor) {
    setMonitors((current) => (
      current.some((monitor) => monitor.id === saved.id)
        ? current.map((monitor) => monitor.id === saved.id ? saved : monitor)
        : [saved, ...current]
    ))
    setEditingMonitor(null)
    setShowCreateForm(false)
  }

  async function handleToggle(monitor: Monitor) {
    try {
      const updated = monitor.enabled
        ? await pauseMonitor(monitor.id)
        : await resumeMonitor(monitor.id)

      handleSaved(updated)
      setLatestChecks((current) => {
        const next = { ...current }
        delete next[monitor.id]
        return next
      })
      setError(null)
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to update monitor.'))
    }
  }

  async function handleCheck(monitor: Monitor) {
    if (checkingIds.includes(monitor.id)) return
    setCheckingIds((current) => [...current, monitor.id])

    try {
      const response = await runMonitorCheck(monitor.id)
      if (!response.check_result || !response.monitor) {
        throw new Error('Invalid check response.')
      }

      setLatestChecks((current) => ({
        ...current,
        [monitor.id]: response.check_result,
      }))
      setMonitors((current) => current.map((item) => (
        item.id === response.monitor.id ? response.monitor : item
      )))

      try {
        const metrics = await getMonitorMetrics(monitor.id, '24h')
        setMetricsByMonitor((current) => ({ ...current, [monitor.id]: metrics }))
      } catch {
        setMetricsUnavailable(true)
      }

      setError(null)
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to check monitor.'))
    } finally {
      setCheckingIds((current) => current.filter((id) => id !== monitor.id))
    }
  }

  async function handleDelete(monitor: Monitor) {
    if (!window.confirm(t('Delete "{name}"?', { name: monitor.name }))) return

    try {
      await deleteMonitor(monitor.id)
      setMonitors((current) => current.filter((item) => item.id !== monitor.id))
      setLatestChecks((current) => {
        const next = { ...current }
        delete next[monitor.id]
        return next
      })
      setMetricsByMonitor((current) => {
        const next = { ...current }
        delete next[monitor.id]
        return next
      })
      setError(null)
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to delete monitor.'))
    }
  }

  const formVisible = showCreateForm || editingMonitor !== null

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-identity">
          <div className="brand">PulseCheck</div>
          <p>
            {t('Signed in as')}{' '}<strong>{user?.email}</strong>
          </p>
        </div>

        <div className="header-actions">
          <LanguageSwitcher />
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/status-page')}
          >
            {t('Status page')}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setEditingMonitor(null)
              setShowCreateForm(true)
            }}
          >
            {t('Add monitor')}
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

      {formVisible && (
        <MonitorForm
          key={editingMonitor?.id ?? 'new-monitor'}
          monitor={editingMonitor}
          onSaved={handleSaved}
          onCancel={() => {
            setEditingMonitor(null)
            setShowCreateForm(false)
          }}
        />
      )}

      {error && <p className="form-error dashboard-error" role="alert">{error}</p>}

      {metricsUnavailable && (
        <div className="dashboard-warning" role="status">
          {t('Some monitoring metrics could not be refreshed. Current monitor states are still available.')}
        </div>
      )}

      <section className="overview-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('Overview')}</p>
            <h1>{t('Monitoring health')}</h1>
            <p className="section-description">
              {t('Live monitor state and trailing 24-hour metrics. Updates automatically every 30 seconds.')}
            </p>
          </div>
        </div>

        <div className="overview-grid">
          <article className="overview-card">
            <span className="overview-label">{t('Monitors')}</span>
            <strong className="overview-value">{formatNumber(summary.total)}</strong>
            <span className="overview-detail">
              {formatNumber(summary.active)} {t('active')} ·{' '}
              {formatNumber(summary.paused)} {t('paused')}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">{t('Uptime · 24h')}</span>
            <strong className="overview-value">
              {formatPercentage(summary.uptime)}
            </strong>
            <span className="overview-detail">
              {t('Weighted across active monitored services')}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">{t('Avg response · 24h')}</span>
            <strong className="overview-value">
              {formatLatency(summary.latency)}
            </strong>
            <span className="overview-detail">
              {formatNumber(summary.totalChecks)} {t('checks observed')}
            </span>
          </article>

          <article className="overview-card">
            <span className="overview-label">{t('Open incidents')}</span>
            <strong
              className={
                summary.openIncidents > 0
                  ? 'overview-value overview-value--danger'
                  : 'overview-value'
              }
            >
              {formatNumber(summary.openIncidents)}
            </strong>
            <span className="overview-detail">
              {t('Confirmed outages currently unresolved')}
            </span>
          </article>
        </div>

        <div className="status-breakdown">
          {([
            ['up', summary.up],
            ['degraded', summary.degraded],
            ['down', summary.down],
            ['pending', summary.pending],
            ['paused', summary.paused],
          ] as const).map(([key, count]) => (
            <span
              key={key}
              className={`status-breakdown-item status-breakdown-item--${key}`}
            >
              {formatNumber(count)} {t(key)}
            </span>
          ))}
        </div>
      </section>

      <section className="monitors-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('Monitoring')}</p>
            <h2>{t('Your monitors')}</h2>
            <p className="section-description">
              {t('Current health, 24-hour performance and monitor controls.')}
            </p>
          </div>
          {!isLoading && (
            <span className="monitor-count">{formatNumber(monitors.length)}</span>
          )}
        </div>

        {isLoading && (
          <div className="dashboard-loading" role="status">
            {t('Loading monitoring data…')}
          </div>
        )}

        {!isLoading && monitors.length === 0 && (
          <div className="empty-state">
            <h2>{t('No monitors yet')}</h2>
            <p>
              {t('Add your first HTTP service to start monitoring availability and response time.')}
            </p>
          </div>
        )}

        {!isLoading && (
          <div className="monitor-list">
            {monitors.map((monitor) => {
              const metrics = metricsByMonitor[monitor.id]
              const observed = !!metrics && metrics.checks.total > 0
              const latest = latestChecks[monitor.id]
              const checking = checkingIds.includes(monitor.id)
              const openIncidents = metrics?.incidents.open_count ?? 0
              const statusClass = monitor.enabled
                ? monitor.status?.toLowerCase() ?? 'pending'
                : 'paused'

              return (
                <article key={monitor.id} className="monitor-card">
                  <div className="monitor-main">
                    <div className="monitor-card-header">
                      <div>
                        <div className="monitor-title-row">
                          <h3>{monitor.name}</h3>
                          <span className={`monitor-status monitor-status--${statusClass}`}>
                            {monitorStatusLabel(monitor)}
                          </span>
                          {openIncidents > 0 && (
                            <span className="incident-indicator">
                              {formatNumber(openIncidents)}{' '}
                              {t(openIncidents === 1 ? 'open incident' : 'open incidents')}
                            </span>
                          )}
                        </div>
                        <p className="monitor-url">{monitor.url}</p>
                      </div>
                    </div>

                    <div className="monitor-metrics">
                      <div className="monitor-metric">
                        <span>{t('Uptime · 24h')}</span>
                        <strong>
                          {observed ? formatPercentage(metrics.uptime.percentage) : '—'}
                        </strong>
                      </div>
                      <div className="monitor-metric">
                        <span>{t('Avg response')}</span>
                        <strong>
                          {observed ? formatLatency(metrics.latency.average_ms) : '—'}
                        </strong>
                      </div>
                      <div className="monitor-metric">
                        <span>{t('Checks · 24h')}</span>
                        <strong>
                          {observed ? formatNumber(metrics.checks.total) : '—'}
                        </strong>
                      </div>
                      <div className="monitor-metric">
                        <span>{t('Check success')}</span>
                        <strong>
                          {observed
                            ? formatPercentage(metrics.checks.success_percentage)
                            : '—'}
                        </strong>
                      </div>
                    </div>

                    <div className="monitor-details">
                      <div>
                        <span>{t('Last checked')}</span>
                        <strong>{formatDateTime(monitor.last_checked_at, 'Never checked')}</strong>
                      </div>
                      <div>
                        <span>{t('Interval')}</span>
                        <strong>{monitor.interval_seconds}s</strong>
                      </div>
                      <div>
                        <span>{t('Timeout')}</span>
                        <strong>{monitor.timeout_seconds}s</strong>
                      </div>
                      <div>
                        <span>{t('Thresholds')}</span>
                        <strong>
                          {monitor.failure_threshold} ↓ / {monitor.recovery_threshold} ↑
                        </strong>
                      </div>
                    </div>

                    {metrics === null && (
                      <p className="monitor-metrics-unavailable">
                        {t('Metrics are temporarily unavailable for this monitor.')}
                      </p>
                    )}
                    {metrics === undefined && (
                      <p className="monitor-metrics-pending">
                        {t('Metrics will appear after the next dashboard refresh.')}
                      </p>
                    )}
                    {latest && (
                      <div className={`raw-check raw-check--${latest.result.toLowerCase()}`}>
                        <span>{t('Latest manual check')}</span>
                        <strong>{checkResultLabel(latest)}</strong>
                      </div>
                    )}
                  </div>

                  <div className="monitor-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => navigate(`/monitors/${monitor.id}`)}
                    >
                      {t('Details')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!monitor.enabled || checking}
                      onClick={() => { void handleCheck(monitor) }}
                    >
                      {t(checking ? 'Checking…' : 'Check now')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setShowCreateForm(false)
                        setEditingMonitor(monitor)
                      }}
                    >
                      {t('Edit')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => { void handleToggle(monitor) }}
                    >
                      {t(monitor.enabled ? 'Pause' : 'Resume')}
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => { void handleDelete(monitor) }}
                    >
                      {t('Delete')}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}