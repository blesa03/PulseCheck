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
  listMonitors,
} from '../monitors/api'

import {
  getStatusPageConfig,
  updateStatusPageConfig,
} from '../status/api'

import type {
  Monitor,
} from '../monitors/types'

import type {
  StatusPageConfig,
} from '../status/types'

import type {
  FormEvent,
} from 'react'


export function StatusPageSettingsPage() {
  const navigate =
    useNavigate()

  const [
    config,
    setConfig,
  ] = useState<
    StatusPageConfig | null
  >(null)

  const [
    monitors,
    setMonitors,
  ] = useState<Monitor[]>([])

  const [
    title,
    setTitle,
  ] = useState('')

  const [
    description,
    setDescription,
  ] = useState('')

  const [
    slug,
    setSlug,
  ] = useState('')

  const [
    enabled,
    setEnabled,
  ] = useState(false)

  const [
    monitorIds,
    setMonitorIds,
  ] = useState<number[]>([])

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    isSaving,
    setIsSaving,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const [
    saved,
    setSaved,
  ] = useState(false)

  useEffect(() => {
    const initialLoadId =
      window.setTimeout(
        () => {
          void Promise.all([
            getStatusPageConfig(),
            listMonitors(),
          ])
            .then(
              ([
                loadedConfig,
                loadedMonitors,
              ]) => {
                setConfig(
                  loadedConfig,
                )

                setMonitors(
                  loadedMonitors,
                )

                setTitle(
                  loadedConfig.title,
                )

                setDescription(
                  loadedConfig.description,
                )

                setSlug(
                  loadedConfig.slug,
                )

                setEnabled(
                  loadedConfig.enabled,
                )

                setMonitorIds(
                  loadedConfig
                    .monitor_ids,
                )

                setError(null)
              },
            )
            .catch(
              (caughtError) => {
                setError(
                  caughtError
                    instanceof ApiError
                    ? caughtError.message
                    : (
                        'Unable to load '
                        + 'status page '
                        + 'settings.'
                      ),
                )
              },
            )
            .finally(() => {
              setIsLoading(false)
            })
        },
        0,
      )

    return () => {
      window.clearTimeout(
        initialLoadId,
      )
    }
  }, [])

  function toggleMonitor(
    monitorId: number,
  ) {
    setMonitorIds(
      (current) => (
        current.includes(
          monitorId,
        )
          ? current.filter(
              (id) => (
                id !== monitorId
              ),
            )
          : [
              ...current,
              monitorId,
            ]
      ),
    )

    setSaved(false)
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setIsSaving(true)
    setSaved(false)
    setError(null)

    try {
      const updated =
        await updateStatusPageConfig(
          {
            title: title.trim(),
            description:
              description.trim(),
            slug:
              slug.trim().toLowerCase(),
            enabled,
            monitor_ids:
              monitorIds,
          },
        )

      setConfig(updated)

      setTitle(updated.title)
      setDescription(
        updated.description,
      )
      setSlug(updated.slug)
      setEnabled(updated.enabled)
      setMonitorIds(
        updated.monitor_ids,
      )

      setSaved(true)
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : (
              'Unable to save '
              + 'status page settings.'
            ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-loading">
          Loading status page settings…
        </div>
      </main>
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
            Public status page
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            navigate('/dashboard')
          }}
        >
          Back to dashboard
        </button>
      </header>

      <section className="status-settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Public status
            </p>

            <h1>
              Status page
            </h1>

            <p className="section-description">
              Publish selected service
              health without exposing
              private monitor
              configuration.
            </p>
          </div>
        </div>

        {error && (
          <p
            className="form-error dashboard-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {saved && (
          <div
            className="save-success"
            role="status"
          >
            Status page settings saved.
          </div>
        )}

        <form
          className="status-settings-form"
          onSubmit={handleSubmit}
        >
          <div className="status-settings-card">
            <label>
              Page title

              <input
                value={title}
                maxLength={120}
                required
                onChange={(event) => {
                  setTitle(
                    event.target.value,
                  )

                  setSaved(false)
                }}
              />
            </label>

            <label>
              Description

              <textarea
                value={description}
                maxLength={240}
                rows={3}
                onChange={(event) => {
                  setDescription(
                    event.target.value,
                  )

                  setSaved(false)
                }}
              />
            </label>

            <label>
              Public slug

              <div className="slug-field">
                <span>
                  /status/
                </span>

                <input
                  value={slug}
                  minLength={3}
                  maxLength={80}
                  required
                  onChange={(event) => {
                    setSlug(
                      event.target.value,
                    )

                    setSaved(false)
                  }}
                />
              </div>
            </label>

            <label className="status-page-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(
                    event.target.checked,
                  )

                  setSaved(false)
                }}
              />

              <span>
                <strong>
                  Publish status page
                </strong>

                <small>
                  Disabled pages return
                  404 publicly.
                </small>
              </span>
            </label>
          </div>

          <div className="status-settings-card">
            <div>
              <h2>
                Published monitors
              </h2>

              <p className="section-description">
                Choose which services
                visitors can see.
              </p>
            </div>

            {monitors.length === 0 ? (
              <div className="detail-empty">
                Create a monitor before
                publishing a status page.
              </div>
            ) : (
              <div className="published-monitor-list">
                {monitors.map(
                  (monitor) => (
                    <label
                      key={monitor.id}
                      className="published-monitor-option"
                    >
                      <input
                        type="checkbox"
                        checked={
                          monitorIds
                            .includes(
                              monitor.id,
                            )
                        }
                        onChange={() => {
                          toggleMonitor(
                            monitor.id,
                          )
                        }}
                      />

                      <span>
                        <strong>
                          {monitor.name}
                        </strong>

                        <small>
                          {monitor.status
                            ?? 'PENDING'}
                        </small>
                      </span>
                    </label>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="status-settings-actions">
            {config && (
              <a
                className={
                  enabled
                    ? 'secondary-link'
                    : (
                        'secondary-link '
                        + 'secondary-link--disabled'
                      )
                }
                href={
                  `/status/${slug}`
                }
                target="_blank"
                rel="noreferrer"
                aria-disabled={
                  !enabled
                }
                onClick={(event) => {
                  if (!enabled) {
                    event.preventDefault()
                  }
                }}
              >
                Open public page
              </a>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={isSaving}
            >
              {isSaving
                ? 'Saving…'
                : 'Save settings'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}