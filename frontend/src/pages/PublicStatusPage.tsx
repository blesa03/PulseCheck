import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import {
  errorMessage,
  formatDateTime,
  formatDuration,
  formatPercentage,
  t,
  useLanguage,
} from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { getPublicStatusPage } from '../status/api'

import type {
  PublicOverallStatus,
  PublicStatusPayload,
} from '../status/types'

const PUBLIC_REFRESH_INTERVAL_MS = 30_000

function overallStatusLabel(status: PublicOverallStatus): string {
  const labels: Record<PublicOverallStatus, string> = {
    UP: 'All systems operational',
    DEGRADED: 'Some systems are degraded',
    DOWN: 'Service disruption detected',
    PENDING: 'Monitoring data pending',
    PAUSED: 'Monitoring is paused',
    NO_DATA: 'No services published',
  }

  return t(labels[status])
}

export function PublicStatusPage() {
  useLanguage()

  const { slug } = useParams()
  const validSlug = typeof slug === 'string' && slug.length > 0

  const [page, setPage] = useState<PublicStatusPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshPage = useCallback(async () => {
    if (!validSlug || !slug) return

    try {
      const loaded = await getPublicStatusPage(slug)
      setPage(loaded)
      setError(null)
    } catch (caughtError) {
      setPage(null)

      const status = (
        typeof caughtError === 'object'
        && caughtError !== null
        && 'status' in caughtError
      ) ? caughtError.status : null

      setError(
        status === 404
          ? t('This status page is unavailable.')
          : errorMessage(caughtError, 'Unable to load service status.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [slug, validSlug])

  useEffect(() => {
    if (!validSlug) return

    const first = window.setTimeout(() => { void refreshPage() }, 0)
    const interval = window.setInterval(
      () => { void refreshPage() },
      PUBLIC_REFRESH_INTERVAL_MS,
    )

    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [refreshPage, validSlug])

  if (!validSlug) {
    return (
      <main className="public-status-shell">
        <div className="public-error-card">
          <LanguageSwitcher />
          <h1>{t('Status page unavailable')}</h1>
        </div>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="public-status-shell">
        <div className="public-status-loading" role="status">
          {t('Loading service status…')}
        </div>
      </main>
    )
  }

  if (!page) {
    return (
      <main className="public-status-shell">
        <div className="public-error-card">
          <div className="brand">PulseCheck</div>
          <LanguageSwitcher />
          <h1>{t('Status page unavailable')}</h1>
          <p>{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="public-status-shell">
      <header className="public-status-header">
        <div>
          <div className="brand">PulseCheck</div>
          <h1>{page.title}</h1>
          {page.description && <p>{page.description}</p>}
        </div>

        <div>
          <LanguageSwitcher />
          <span className="public-generated">
            {t('Updated')} {formatDateTime(page.generated_at)}
          </span>
        </div>
      </header>

      <section
        className={`public-overall-status public-overall-status--${page.overall_status.toLowerCase()}`}
      >
        <span className="public-status-dot" />
        <strong>{overallStatusLabel(page.overall_status)}</strong>
      </section>

      <section className="public-status-section">
        <div>
          <p className="eyebrow">{t('Services')}</p>
          <h2>{t('Current status')}</h2>
        </div>

        {page.monitors.length === 0 ? (
          <div className="detail-empty">
            {t('No services have been published.')}
          </div>
        ) : (
          <div className="public-monitor-list">
            {page.monitors.map((monitor) => (
              <article key={monitor.id} className="public-monitor-card">
                <div className="public-monitor-heading">
                  <div>
                    <h3>{monitor.name}</h3>
                    <span
                      className={`monitor-status monitor-status--${monitor.status.toLowerCase()}`}
                    >
                      {t(monitor.status)}
                    </span>
                  </div>

                  <div className="public-uptime">
                    <span>{t('30-day uptime')}</span>
                    <strong>{formatPercentage(monitor.uptime_30d)}</strong>
                  </div>
                </div>

                <div className="public-history">
                  {monitor.daily.length === 0 ? (
                    <span className="public-history-empty">
                      {t('Awaiting historical data')}
                    </span>
                  ) : (
                    monitor.daily.map((day) => {
                      const uptime = day.uptime_percentage
                      const state = uptime === null
                        ? 'unknown'
                        : uptime === 100
                          ? 'up'
                          : uptime >= 99
                            ? 'degraded'
                            : 'down'

                      return (
                        <span
                          key={day.date}
                          className={`public-history-day public-history-day--${state}`}
                          title={`${day.date}: ${formatPercentage(uptime)}`}
                        />
                      )
                    })
                  )}
                </div>

                <span className="public-last-check">
                  {t('Last checked:')} {formatDateTime(monitor.last_checked_at)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="public-status-section">
        <div>
          <p className="eyebrow">{t('Incidents')}</p>
          <h2>{t('Recent incidents')}</h2>
        </div>

        {page.incidents.length === 0 ? (
          <div className="public-no-incidents">
            {t('No incidents reported.')}
          </div>
        ) : (
          <div className="incident-list">
            {page.incidents.map((incident) => {
              const open = incident.resolved_at === null

              return (
                <article key={incident.id} className="incident-card">
                  <div>
                    <span
                      className={
                        open
                          ? 'incident-status incident-status--open'
                          : 'incident-status incident-status--resolved'
                      }
                    >
                      {t(open ? 'Open' : 'Resolved')}
                    </span>
                    <h3>{incident.monitor_name}</h3>
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
      </section>

      <footer className="public-status-footer">
        {t('Powered by PulseCheck')}
      </footer>
    </main>
  )
}