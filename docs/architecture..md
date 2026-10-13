
# PulseCheck — Architecture and API

## 1. Overview

PulseCheck is a full-stack application for monitoring public HTTP/HTTPS
services. It combines a Django REST API, a React frontend, PostgreSQL
persistence and Celery background execution.

This document describes the implementation and its most important
contracts and invariants.

For installation and deployment instructions, see [Production and development](production.md).

## 2. Components

### Frontend

The frontend is built with React, TypeScript, Vite and React Router.

It provides:

- Registration and login.
- Private monitoring dashboard.
- Monitor creation and editing.
- Manual checks, pause, resume and deletion actions.
- Monitor detail pages with history and metrics.
- Public status page configuration.
- Anonymous public status pages.
- English and Spanish interface localization.

The frontend consumes REST endpoints. PostgreSQL-backed services, rather
than the browser, determine the authoritative monitoring state and
metrics.

### Django REST API

Django REST Framework exposes authentication, monitor management,
monitoring metrics, incident history and public status endpoints.

Authenticated monitor queries are scoped to the requesting user.
The public status endpoint is explicitly anonymous and returns a
restricted representation.

### PostgreSQL

PostgreSQL persists application accounts, refresh tokens, monitor
configurations, individual check results, incidents, daily aggregates
and public status page configuration.

### Redis

Redis provides:

- The Celery broker.
- The configured Celery result backend.
- Shared Django cache storage.
- Rate-limiting state shared across API workers.

Redis is not the authoritative store for historical monitoring data.

### Celery

Celery executes the periodic HTTP checks and retention tasks.

Celery Beat dispatches scheduled work. The Celery worker performs
individual checks and persists the results.

## 3. Request and execution flow

```text
Browser
  |
  | HTTPS / REST
  v
React application
  |
  v
Django REST Framework
  |
  +---- Authentication / authorization
  |
  +---- Monitor configuration ------> PostgreSQL
  |
  +---- Metrics / incident queries -> PostgreSQL
  |
  +---- Public status queries ------> PostgreSQL


Celery Beat
  |
  | dispatch due monitors
  v
Celery Worker
  |
  | validate target and DNS resolution
  | execute HTTP request
  | validate redirects
  v
HTTP check outcome
  |
  | transaction + monitor lock
  v
CheckResult + DailyMetric + state transition
  |
  v
PostgreSQL
```

The scheduler and user-triggered manual checks share the monitoring
execution and persistence services.

## 4. Data model

### User

An application account identified by a unique email address.

Authentication uses Django's custom user model and JWT-based API access.

### RefreshToken

Stored token metadata used to support rotating refresh tokens.

Relevant fields:

- User reference.
- Unique JWT identifier.
- Hash of the refresh token.
- Expiration timestamp.
- Optional revocation timestamp.

Raw refresh tokens are not stored directly in this model.

### Monitor

Represents a user-owned HTTP service configuration.

Important fields:

| Field | Meaning |
|---|---|
| `owner` | Account that owns the monitor |
| `name` | Display name |
| `url` | HTTP/HTTPS target |
| `interval_seconds` | Scheduled check interval |
| `timeout_seconds` | HTTP request timeout |
| `failure_threshold` | Failures needed to confirm an outage |
| `recovery_threshold` | Successes needed to resolve an outage |
| `retention_policy` | Raw check retention strategy |
| `follow_redirects` | Whether redirects are followed |
| `accepted_status_ranges` | HTTP statuses considered successful |
| `status` | Current confirmed monitor state |
| `enabled` | Whether monitoring is enabled |
| `next_check_at` | Next scheduled execution |
| `config_version` | Configuration generation used for concurrency checks |

The database enforces valid interval and threshold ranges.

A monitor can have a null status before its first observation.

### CheckResult

An individual HTTP observation.

Stores the result, HTTP status when available, response time, error
classification and observation timestamp.

The result can be:

- `SUCCESS`
- `FAILURE`

It is separate from the monitor state. A failed observation does not
necessarily imply that the monitor has entered the `DOWN` state.

### Incident

Represents a confirmed service outage.

Relevant fields:

- `monitor`
- `started_at`
- `resolved_at`

A null resolution timestamp indicates an open incident.

A partial unique constraint prevents multiple simultaneous open
incidents for the same monitor.

### DailyMetric

Stores daily aggregates for a monitor.

The aggregate includes:

- Total checks.
- Successful checks.
- Failed checks.
- Total response time.
- Minimum response time.
- Maximum response time.

There is one row per monitor and calendar date.

The API derives the average response time from the accumulated
response time and check count.

### PublicStatusPage

Represents a user-owned public status page.

It includes:

- A unique slug.
- Title and description.
- Enabled/disabled state.
- Selected monitors.

Only monitors belonging to the page owner are exposed by the public
status API.

## 5. State engine

PulseCheck distinguishes individual observations from confirmed
service health.

### States

| State | Meaning |
|---|---|
| `UP` | Service is considered operational |
| `DEGRADED` | An intermediate failure or recovery condition exists |
| `DOWN` | An outage has been confirmed |
| `PAUSED` | Monitoring is disabled |
| `null` | No confirmed monitoring state yet |

The public status API represents the null state as `PENDING`.

### Failure transitions

A failed check increments the consecutive failure counter and clears
the recovery counter.

If an incident is already open, the monitor remains DOWN.

Otherwise:

- Below `failure_threshold`: DEGRADED.
- At the threshold: DOWN, and an incident is created.

### Recovery transitions

A successful check clears the failure counter and increments the
recovery counter.

If no incident is open, the monitor becomes UP.

If an incident is open:

- Below `recovery_threshold`: DEGRADED.
- At the threshold: the incident is resolved and the monitor becomes UP.

### Pause and resume

Pausing a monitor disables it and clears its scheduling state.

Resuming enables it, clears the confirmed status and makes it
eligible for a new check.

A change of monitoring URL also resets the relevant state and
prevents the previous target's observations from defining the new
configuration.

## 6. Consistency and concurrency

HTTP checks may take longer than configuration changes.

For example, a user might pause a monitor while an HTTP request is
still running.

To handle this, the backend uses:

- A `config_version` field to detect changed monitor configuration.
- `select_for_update()` when recording results and changing state.
- Timestamp comparison to reject results older than the latest stored
  observation.
- Atomic persistence of individual results, daily aggregates and state
  transitions.

A stale or obsolete check cannot silently overwrite a newer state.

Scheduled dispatch claims due monitors using row locking and
`skip_locked`, then advances their next execution time.

A failed task enqueue attempts to restore scheduling eligibility
for the affected monitor.

## 7. Historical metrics

Metrics are available for these periods:

- `24h`
- `7d`
- `30d`
- `all`

### Uptime

Uptime represents availability based on confirmed incidents.

For a selected window:

```text
window_seconds = end - start

downtime_seconds =
    sum of incident durations overlapping the selected window

uptime_percentage =
    ((window_seconds - downtime_seconds) / window_seconds) * 100
```

Incident overlap is bounded by the reporting window.

This means uptime and successful-check percentage have different
meanings and may produce different values.

### Check success

```text
success_percentage =
    successful_checks / total_checks * 100
```

### Average response time

```text
average_response_time_ms =
    total_response_time_ms / total_checks
```

The 24-hour period uses retained individual check results.

Longer periods use daily aggregated metrics. Consequently, the
availability of detailed raw observations depends on the chosen
retention policy, while daily history is preserved separately.

### Raw retention

Supported policies:

| Policy | Raw result retention |
|---|---|
| `48_HOURS` | 48 hours |
| `7_DAYS` | 7 days |
| `14_DAYS` | 14 days |
| `30_DAYS` | 30 days |
| `FOREVER` | No age-based deletion |

The retention task deletes expired raw observations in batches.

Daily aggregated metrics and incident history are distinct records
and are not removed by this raw-check retention task.

## 8. HTTP target security

Accepting arbitrary monitoring URLs creates SSRF risks.

PulseCheck's target policy:

1. Accepts only absolute HTTP and HTTPS URLs.
2. Rejects loopback, private and reserved IP addresses.
3. Rejects internal and otherwise disallowed hostnames.
4. Resolves DNS and rejects an answer containing unsafe addresses.
5. Connects to an already validated address.
6. Preserves the original HTTP Host header and HTTPS SNI.
7. Validates redirect destinations separately.
8. Limits the number of followed redirects.

Checks also use request timeouts and HTTPX with environment proxy
trust disabled.

These controls reduce the attack surface but do not replace network
segmentation, outbound firewall policies or a production security
review.

## 9. Authentication and authorization

Authentication endpoints support account registration, login,
token refresh and logout.

PulseCheck uses:

- Email-based login.
- Short-lived JWT access tokens.
- Rotating refresh tokens.
- HttpOnly refresh cookies.
- Server-side refresh token hash and revocation records.
- Authenticated access to private monitor endpoints.

Authorization is enforced by Django, not just by React route guards.

Users can only access monitors owned by their account.

Public status page configuration requires authentication.

Public status page viewing does not.

## 10. REST API

Development base URL:

```text
http://localhost:8000/api/
```

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register/` | Create an account |
| POST | `/auth/login/` | Authenticate |
| POST | `/auth/refresh/` | Rotate refresh token |
| POST | `/auth/logout/` | Revoke current refresh token |
| GET | `/auth/me/` | Return authenticated user |

Registration payload:

```json
{
  "email": "developer@example.com",
  "password": "Strong-Password-Example!",
  "password_confirm": "Strong-Password-Example!"
}
```

Login payload:

```json
{
  "email": "developer@example.com",
  "password": "Strong-Password-Example!"
}
```

Successful registration and login return an access token and
serialized user data. The refresh token is delivered through
an HttpOnly cookie.

An authenticated request uses:

```http
Authorization: Bearer <access_token>
```

### Monitors

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/monitors/` | List owned monitors |
| POST | `/monitors/` | Create a monitor |
| GET | `/monitors/{id}/` | Retrieve monitor |
| PATCH | `/monitors/{id}/` | Update monitor |
| DELETE | `/monitors/{id}/` | Delete monitor |
| POST | `/monitors/{id}/pause/` | Pause monitoring |
| POST | `/monitors/{id}/resume/` | Resume monitoring |
| POST | `/monitors/{id}/check/` | Run a manual check |
| GET | `/monitors/{id}/checks/` | Retrieve recent raw checks |
| GET | `/monitors/{id}/incidents/` | Retrieve incidents |
| GET | `/monitors/{id}/metrics/` | Retrieve metrics |

Example monitor creation:

```json
{
  "name": "Production API",
  "url": "https://example.com/health",
  "interval_seconds": 60,
  "timeout_seconds": 10,
  "failure_threshold": 2,
  "recovery_threshold": 1,
  "retention_policy": "30_DAYS",
  "follow_redirects": true,
  "accepted_status_ranges": [
    {
      "min": 200,
      "max": 399
    }
  ]
}
```

The server manages status, counters and scheduling timestamps.

### Metric and history parameters

| Endpoint | Query parameter | Values |
|---|---|---|
| Metrics | `period` | `24h`, `7d`, `30d`, `all` |
| Checks | `limit` | 1–100, default 50 |
| Incidents | `limit` | 1–100, default 100 |

Examples:

```http
GET /api/monitors/12/metrics/?period=7d
GET /api/monitors/12/checks/?limit=25
GET /api/monitors/12/incidents/?limit=20
```

Metrics responses include the reporting window, uptime, check
statistics, latency, incident counts and daily aggregates.

### Status pages

| Method | Endpoint | Authentication |
|---|---|---|
| GET | `/status-page/` | Required |
| PATCH | `/status-page/` | Required |
| GET | `/public/status/{slug}/` | Anonymous |

Configuration example:

```json
{
  "title": "Service Status",
  "description": "Availability of our services",
  "slug": "service-status",
  "enabled": true,
  "monitor_ids": [1, 2, 3]
}
```

The public response includes:

- Page title and description.
- Aggregated overall status.
- Public monitor names and states.
- Last check timestamps.
- 30-day uptime and daily history.
- Recent incidents.

It does not expose private monitor URLs or threshold configuration.

The overall status prioritizes DOWN, then DEGRADED, PENDING, UP
and PAUSED. An empty selection returns `NO_DATA`.

### Health endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health/` | Process health |
| GET | `/health/ready/` | PostgreSQL and Redis readiness |

Health endpoints are mounted beneath `/api/`.

Readiness returns HTTP 503 if one of the checked dependencies
is unavailable.

## 11. Rate limiting

The Django REST API uses Redis-backed throttling.

Separate scopes cover:

- Anonymous requests.
- Authenticated requests.
- Authentication endpoints.
- Manual monitor checks.
- Public status page requests.

Configured limits are adjustable through environment variables.

Application-level throttling is not a substitute for protection at
the reverse proxy or network boundary.

## 12. Internationalization

The React interface supports English and Spanish.

The selected language is persisted in browser storage.

Interface labels, monitoring states, error presentation and selected
date/number formats are localized.

API identifiers, monitoring states and persisted data retain stable
machine-readable values regardless of frontend language.

User-authored names, descriptions and page titles are not automatically
translated.

## 13. Testing strategy

Backend tests cover:

- Authentication and permissions.
- Monitor validation and CRUD behavior.
- HTTP check classification.
- State transitions and incidents.
- Scheduling and stale-result handling.
- Retention and aggregated metrics.
- Public status page access.
- HTTP target security and concurrency protections.
- Public status query behavior.

Frontend tests cover selected authentication, dashboard, detail,
public status and internationalization behavior.

The CI pipeline additionally runs code quality and compilation checks.

The automated test suites do not prove that every possible failure
path, browser workflow or deployment configuration is covered.

## 14. MVP boundaries

PulseCheck is designed as a focused monitoring MVP.

The current scope does not include:

- Alert delivery through email or messaging providers.
- Distributed multi-region monitoring.
- High-availability orchestration.
- Automatic DNS, TLS certificate or reverse proxy provisioning.
- Full-scale observability or tracing.
- Guaranteed delivery semantics for every external notification.

Those capabilities could be considered for future versions, but are
not required to understand or operate the current MVP.
