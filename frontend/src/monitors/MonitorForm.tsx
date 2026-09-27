import {
  useState,
} from 'react'

import {
  ApiError,
} from '../api/client'

import {
  createMonitor,
  updateMonitor,
} from './api'

import {
  formatStatusRanges,
  parseStatusRanges,
} from './statusRanges'

import type {
  Monitor,
  MonitorWritePayload,
  RetentionPolicy,
} from './types'

import type {
  FormEvent,
} from 'react'


const intervalPresets = [
  {
    value: 30,
    label: '30 seconds',
  },
  {
    value: 60,
    label: '1 minute',
  },
  {
    value: 300,
    label: '5 minutes',
  },
  {
    value: 900,
    label: '15 minutes',
  },
  {
    value: 1800,
    label: '30 minutes',
  },
  {
    value: 3600,
    label: '1 hour',
  },
  {
    value: 21600,
    label: '6 hours',
  },
  {
    value: 86400,
    label: '24 hours',
  },
]


interface MonitorFormProps {
  monitor?: Monitor | null

  onSaved: (
    monitor: Monitor,
  ) => void

  onCancel: () => void
}


export function MonitorForm({
  monitor,
  onSaved,
  onCancel,
}: MonitorFormProps) {
  const initialInterval =
    monitor?.interval_seconds ?? 60

  const initialPreset =
    intervalPresets.some(
      ({ value }) => (
        value === initialInterval
      ),
    )
      ? String(initialInterval)
      : 'custom'

  const [name, setName] =
    useState(
      monitor?.name ?? '',
    )

  const [url, setUrl] =
    useState(
      monitor?.url ?? '',
    )

  const [
    intervalSeconds,
    setIntervalSeconds,
  ] = useState(initialInterval)

  const [
    intervalMode,
    setIntervalMode,
  ] = useState(initialPreset)

  const [
    timeoutSeconds,
    setTimeoutSeconds,
  ] = useState(
    monitor?.timeout_seconds ?? 10,
  )

  const [
    failureThreshold,
    setFailureThreshold,
  ] = useState(
    monitor?.failure_threshold ?? 2,
  )

  const [
    recoveryThreshold,
    setRecoveryThreshold,
  ] = useState(
    monitor?.recovery_threshold ?? 1,
  )

  const [
    retentionPolicy,
    setRetentionPolicy,
  ] = useState<RetentionPolicy>(
    monitor?.retention_policy
      ?? '30_DAYS',
  )

  const [
    followRedirects,
    setFollowRedirects,
  ] = useState(
    monitor?.follow_redirects ?? true,
  )

  const [
    statusRanges,
    setStatusRanges,
  ] = useState(
    formatStatusRanges(
      monitor?.accepted_status_ranges
        ?? [
          {
            min: 200,
            max: 399,
          },
        ],
    ),
  )

  const [error, setError] =
    useState<string | null>(null)

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false)

  const isEditing =
    monitor !== null
    && monitor !== undefined

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setError(null)
    setIsSubmitting(true)

    try {
      const payload:
        MonitorWritePayload = {
          name: name.trim(),
          url: url.trim(),

          interval_seconds:
            intervalSeconds,

          timeout_seconds:
            timeoutSeconds,

          failure_threshold:
            failureThreshold,

          recovery_threshold:
            recoveryThreshold,

          retention_policy:
            retentionPolicy,

          follow_redirects:
            followRedirects,

          accepted_status_ranges:
            parseStatusRanges(
              statusRanges,
            ),
        }

      const savedMonitor =
        isEditing
          ? await updateMonitor(
              monitor.id,
              payload,
            )
          : await createMonitor(
              payload,
            )

      onSaved(savedMonitor)
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          || caughtError instanceof Error
          ? caughtError.message
          : 'Unable to save monitor.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="monitor-form-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Monitor configuration
          </p>

          <h2>
            {isEditing
              ? 'Edit monitor'
              : 'Add monitor'}
          </h2>
        </div>
      </div>

      <form
        className="monitor-form"
        onSubmit={handleSubmit}
      >
        <label>
          Name

          <input
            value={name}
            onChange={(event) => {
              setName(
                event.target.value,
              )
            }}
            maxLength={120}
            required
          />
        </label>

        <label>
          URL

          <input
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(
                event.target.value,
              )
            }}
            placeholder="https://example.com"
            required
          />
        </label>

        <div className="form-grid">
          <label>
            Check interval

            <select
              value={intervalMode}
              onChange={(event) => {
                const value =
                  event.target.value

                setIntervalMode(value)

                if (
                  value !== 'custom'
                ) {
                  setIntervalSeconds(
                    Number(value),
                  )
                }
              }}
            >
              {intervalPresets.map(
                ({ value, label }) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ),
              )}

              <option value="custom">
                Custom
              </option>
            </select>
          </label>

          {intervalMode === 'custom' && (
            <label>
              Interval in seconds

              <input
                type="number"
                min={30}
                max={86400}
                value={intervalSeconds}
                onChange={(event) => {
                  setIntervalSeconds(
                    Number(
                      event.target.value,
                    ),
                  )
                }}
                required
              />
            </label>
          )}

          <label>
            Timeout in seconds

            <input
              type="number"
              min={1}
              max={30}
              value={timeoutSeconds}
              onChange={(event) => {
                setTimeoutSeconds(
                  Number(
                    event.target.value,
                  ),
                )
              }}
              required
            />
          </label>

          <label>
            Failure threshold

            <input
              type="number"
              min={1}
              max={5}
              value={failureThreshold}
              onChange={(event) => {
                setFailureThreshold(
                  Number(
                    event.target.value,
                  ),
                )
              }}
              required
            />
          </label>

          <label>
            Recovery threshold

            <input
              type="number"
              min={1}
              max={5}
              value={recoveryThreshold}
              onChange={(event) => {
                setRecoveryThreshold(
                  Number(
                    event.target.value,
                  ),
                )
              }}
              required
            />
          </label>

          <label>
            Raw check retention

            <select
              value={retentionPolicy}
              onChange={(event) => {
                setRetentionPolicy(
                  event.target
                    .value as RetentionPolicy,
                )
              }}
            >
              <option value="48_HOURS">
                48 hours
              </option>

              <option value="7_DAYS">
                7 days
              </option>

              <option value="14_DAYS">
                14 days
              </option>

              <option value="30_DAYS">
                30 days
              </option>

              <option value="FOREVER">
                Forever
              </option>
            </select>
          </label>
        </div>

        <label>
          Accepted HTTP statuses

          <input
            value={statusRanges}
            onChange={(event) => {
              setStatusRanges(
                event.target.value,
              )
            }}
            placeholder="200-399, 404"
            required
          />

          <span className="field-help">
            Examples: 200-399 or
            200-204, 301, 404
          </span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={followRedirects}
            onChange={(event) => {
              setFollowRedirects(
                event.target.checked,
              )
            }}
          />

          Follow HTTP redirects
        </label>

        {error && (
          <p
            className="form-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Saving…'
              : isEditing
                ? 'Save changes'
                : 'Create monitor'}
          </button>
        </div>
      </form>
    </section>
  )
}