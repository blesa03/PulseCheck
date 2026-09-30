import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  useParams,
} from 'react-router-dom'

import {
  ApiError,
} from '../api/client'

import {
  getPublicStatusPage,
} from '../status/api'

import type {
  PublicOverallStatus,
  PublicStatusPayload,
} from '../status/types'


const PUBLIC_REFRESH_INTERVAL_MS =
  30_000


function overallStatusLabel(
  status: PublicOverallStatus,
) {
  switch (status) {
    case 'UP':
      return 'All systems operational'

    case 'DEGRADED':
      return 'Some systems are degraded'

    case 'DOWN':
      return 'Service disruption detected'

    case 'PENDING':
      return 'Monitoring data pending'

    case 'PAUSED':
      return 'Monitoring is paused'

    case 'NO_DATA':
      return 'No services published'
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


function formatDuration(
  seconds: number,
) {
  if (seconds < 60) {
    return `${seconds}s`
  }

  if (seconds < 3600) {
    return `${Math.floor(
      seconds / 60,
    )}m`
  }

  if (seconds < 86400) {
    return `${Math.floor(
      seconds / 3600,
    )}h`
  }

  return `${Math.floor(
    seconds / 86400,
  )}d`
}


export function PublicStatusPage() {
  const {
    slug,
  } = useParams()

  const [
    page,
    setPage,
  ] = useState<
    PublicStatusPayload | null
  >(null)

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const validSlug =
    typeof slug === 'string'
    && slug.length > 0

  const refreshPage =
    useCallback(
      async () => {
        if (!validSlug || !slug) {
          return
        }

        try {
          const loadedPage =
            await getPublicStatusPage(
              slug,
            )

          setPage(loadedPage)
          setError(null)
        } catch (caughtError) {
          setPage(null)

          if (
            caughtError
            instanceof ApiError
            && caughtError.status
            === 404
          ) {
            setError(
              'This status page is unavailable.',
            )
          } else {
            setError(
              (
                'Unable to load '
                + 'service status.'
              ),
            )
          }
        } finally {
          setIsLoading(false)
        }
      },
      [
        slug,
        validSlug,
      ],
    )

  useEffect(() => {
    if (!validSlug) {
      return
    }

    const initialRefreshId =
      window.setTimeout(
        () => {
          void refreshPage()
        },
        0,
      )

    const intervalId =
      window.setInterval(
        () => {
          void refreshPage()
        },
        PUBLIC_REFRESH_INTERVAL_MS,
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
    refreshPage,
    validSlug,
  ])

  if (!validSlug) {
    return (
      <main className="public-status-shell">
        <div className="public-error-card">
          Status page unavailable.
        </div>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="public-status-shell">
        <div className="public-status-loading">
          Loading service status…
        </div>
      </main>
    )
  }

  if (!page) {
    return (
      <main className="public-status-shell">
        <div className="public-error-card">
          <div className="brand">
            PulseCheck
          </div>

          <h1>
            Status page unavailable
          </h1>

          <p>
            {error}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="public-status-shell">
      <header className="public-status-header">
        <div>
          <div className="brand">
            PulseCheck
          </div>

          <h1>
            {page.title}
          </h1>

          {page.description && (
            <p>
              {page.description}
            </p>
          )}
        </div>

        <span className="public-generated">
          Updated{' '}
          {formatDateTime(
            page.generated_at,
          )}
        </span>
      </header>

      <section
        className={
          (
            'public-overall-status '
            + `public-overall-status--${
              page.overall_status
                .toLowerCase()
            }`
          )
        }
      >
        <span className="public-status-dot" />

        <strong>
          {overallStatusLabel(
            page.overall_status,
          )}
        </strong>
      </section>

      <section className="public-status-section">
        <div>
          <p className="eyebrow">
            Services
          </p>

          <h2>
            Current status
          </h2>
        </div>

        {page.monitors.length === 0 ? (
          <div className="detail-empty">
            No services have been
            published.
          </div>
        ) : (
          <div className="public-monitor-list">
            {page.monitors.map(
              (monitor) => (
                <article
                  key={monitor.id}
                  className="public-monitor-card"
                >
                  <div className="public-monitor-heading">
                    <div>
                      <h3>
                        {monitor.name}
                      </h3>

                      <span
                        className={
                          (
                            'monitor-status '
                            + `monitor-status--${
                              monitor.status
                                .toLowerCase()
                            }`
                          )
                        }
                      >
                        {monitor.status}
                      </span>
                    </div>

                    <div className="public-uptime">
                      <span>
                        30-day uptime
                      </span>

                      <strong>
                        {formatPercentage(
                          monitor
                            .uptime_30d,
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="public-history">
                    {monitor.daily.length
                      === 0
                      ? (
                          <span className="public-history-empty">
                            Awaiting historical
                            data
                          </span>
                        )
                      : monitor.daily.map(
                          (day) => {
                            const uptime =
                              day
                                .uptime_percentage

                            const state =
                              uptime === null
                                ? 'unknown'
                                : uptime
                                  === 100
                                  ? 'up'
                                  : uptime
                                    >= 99
                                    ? 'degraded'
                                    : 'down'

                            return (
                              <span
                                key={
                                  day.date
                                }
                                className={
                                  (
                                    'public-history-day '
                                    + `public-history-day--${state}`
                                  )
                                }
                                title={
                                  (
                                    `${day.date}: `
                                    + formatPercentage(
                                      uptime,
                                    )
                                  )
                                }
                              />
                            )
                          },
                        )}
                  </div>

                  <span className="public-last-check">
                    Last checked:{' '}
                    {formatDateTime(
                      monitor
                        .last_checked_at,
                    )}
                  </span>
                </article>
              ),
            )}
          </div>
        )}
      </section>

      <section className="public-status-section">
        <div>
          <p className="eyebrow">
            Incidents
          </p>

          <h2>
            Recent incidents
          </h2>
        </div>

        {page.incidents.length === 0 ? (
          <div className="public-no-incidents">
            No incidents reported.
          </div>
        ) : (
          <div className="incident-list">
            {page.incidents.map(
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
                        {incident
                          .monitor_name}
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
      </section>

      <footer className="public-status-footer">
        Powered by PulseCheck
      </footer>
    </main>
  )
}