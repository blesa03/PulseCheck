
# PulseCheck — Development, deployment and operations

## 1. Purpose

This document explains how to configure, run, test and deploy PulseCheck.

Two environments are supported by the repository:

- Development: Django development server and Vite, running through Docker Compose.
- Production: Gunicorn, a compiled React frontend served by Nginx, PostgreSQL, Redis and Celery.

The production configuration targets a single host. It is not a
multi-node high-availability deployment and does not provision DNS,
TLS certificates or an external HTTPS reverse proxy.

For the system internals, see [Architecture and API](architecture.md).

## 2. Requirements

### Development

- Docker Engine.
- Docker Compose plugin.
- Git.
- Enough available resources for PostgreSQL, Redis, Django, Celery
  and the frontend.

Local Python and Node.js installations are optional when using Docker.

### Production

In addition to the development requirements:

- A Linux host capable of running Docker Compose.
- A DNS name pointing to the deployment.
- A trusted HTTPS reverse proxy.
- Valid TLS certificates.
- Persistent storage.
- A database backup and recovery strategy.
- An operational procedure for updating images and secrets.

## 3. Repository structure

```text
PulseCheck/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── config/
│   ├── core/
│   ├── monitors/
│   │   ├── management/commands/
│   │   └── services/
│   └── users/
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── docs/
│   ├── architecture.md
│   ├── production.md
│   └── screenshots/
├── docker-compose.yml
├── compose.production.yml
├── .env.example
├── .env.production.example
└── README.md
```

## 4. Development environment

### 4.1. Configure the environment

From the project root in PowerShell:

```powershell
Copy-Item .env.example .env
```

Review the copied file.

At minimum, use development-specific values for the database
password and Django/JWT secrets.

The default Docker Compose configuration uses:

| Component | Internal connection |
|---|---|
| PostgreSQL | `db:5432` |
| Redis broker | `redis:6379/0` |
| Redis result backend | `redis:6379/1` |
| Django cache | `redis:6379/2` |
| Django backend | `backend:8000` |
| React frontend | `frontend:5173` |

Within Docker containers, use service names rather than
`localhost` when connecting to another container.

For example, Django's Redis cache URL should be:

```env
DJANGO_CACHE_URL=redis://redis:6379/2
```

### 4.2. Start the services

```powershell
docker compose up -d --build
docker compose ps
```

The development backend performs static collection and database
migrations before starting Django.

The services are:

- `db`
- `redis`
- `backend`
- `worker`
- `beat`
- `frontend`

### 4.3. Local addresses

| Resource | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Login | http://localhost:5173/login |
| Registration | http://localhost:5173/register |
| Dashboard | http://localhost:5173/dashboard |
| API health | http://localhost:8000/api/health/ |
| API readiness | http://localhost:8000/api/health/ready/ |

The dashboard requires authentication.

### 4.4. Inspect logs

```powershell
docker compose logs backend frontend --tail 100
docker compose logs worker beat --tail 100
```

To follow the backend logs:

```powershell
docker compose logs -f backend
```

Press `Ctrl+C` to stop following logs. The containers remain running.

### 4.5. Stop the environment

```powershell
docker compose down
```

This stops the containers without deleting persistent database volumes.

Do not run `docker compose down -v` unless you explicitly intend to
delete the development environment's persistent data.

## 5. Environment variables

### Django

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django signing secret |
| `DJANGO_DEBUG` | Debug mode |
| `DJANGO_ALLOWED_HOSTS` | Allowed HTTP hosts |
| `DJANGO_SECURE_SSL_REDIRECT` | HTTPS redirection |
| `DJANGO_TRUST_PROXY_SSL_HEADER` | Trust configured proxy HTTPS indication |
| `DJANGO_HSTS_SECONDS` | HSTS duration |
| `DJANGO_MAX_REQUEST_BYTES` | Request size limit |

Production must use `DJANGO_DEBUG=False` and a unique secret.

### PostgreSQL

| Variable | Purpose |
|---|---|
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_HOST` | Database hostname |
| `POSTGRES_PORT` | Internal port |
| `POSTGRES_CONN_MAX_AGE` | Connection reuse |
| `POSTGRES_HOST_PORT` | Development host port |

### Redis and Celery

| Variable | Purpose |
|---|---|
| `REDIS_URL` | Redis connection |
| `DJANGO_CACHE_URL` | Shared Django cache |
| `CELERY_BROKER_URL` | Task broker |
| `CELERY_RESULT_BACKEND` | Task result storage |
| `MONITOR_DISPATCH_BATCH_SIZE` | Maximum monitor claims per dispatch |
| `CHECK_RETENTION_DELETE_BATCH_SIZE` | Raw result deletion batch size |

### Authentication

| Variable | Purpose |
|---|---|
| `JWT_SIGNING_KEY` | JWT signing secret |
| `JWT_ACCESS_TOKEN_LIFETIME_SECONDS` | Access token lifetime |
| `JWT_REFRESH_TOKEN_LIFETIME_SECONDS` | Refresh token lifetime |
| `JWT_REFRESH_COOKIE_SECURE` | Secure cookie requirement |
| `JWT_REFRESH_COOKIE_SAMESITE` | SameSite cookie policy |

### API and frontend

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Frontend API base URL |
| `CORS_ALLOWED_ORIGINS` | Browser origins allowed by CORS |
| `CSRF_TRUSTED_ORIGINS` | Trusted CSRF origins |
| `TRUSTED_PROXY_COUNT` | Number of trusted reverse proxies |

### Throttling

Separate rate limits are configurable for:

- Anonymous requests.
- Authenticated requests.
- Authentication endpoints.
- Manual checks.
- Public status pages.

See `.env.example` and `.env.production.example` for the
configuration variable names and initial values.

## 6. Synthetic demonstration data

PulseCheck includes a development-only management command for
generating a monitoring scenario suitable for screenshots and
local exploration.

### Purpose

The scenario produces:

- Nine example monitors.
- Five different visible monitor conditions.
- Thirty days of hourly synthetic observations.
- Daily response-time and check aggregates.
- Open and resolved incidents.
- Public status information for the demonstration monitors.

The command constructs data directly in PostgreSQL.
It does not send HTTP requests to fictional service URLs.

### Existing account

The demonstration uses the existing account:

```text
pulsecheck@gmail.com
```

The account must already exist. The command does not create users,
change passwords, or modify account credentials.

### Generate the dataset

From the repository root:

```powershell
docker compose exec backend python manage.py seed_demo
```

Sign in through the frontend with the account's existing password.

If the account already has a public status page, its title,
description, slug, publication state and unrelated monitor selections
are preserved.

If no public status page exists, the command creates one using:

```text
/status/pulsecheck-demo
```

The command prints the actual page slug after execution.

If the existing page is disabled, enable it through the application
before attempting to open it anonymously.

### Regenerate the dataset

Run:

```powershell
docker compose exec backend python manage.py seed_demo --reset
```

The reset operation deletes and recreates recognized synthetic
monitors, along with their generated checks, incidents and metrics.

It preserves:

- The existing user and password.
- Monitors not recognized as synthetic demonstration records.
- Other users and their monitoring data.
- The existing public status page configuration.
- Unrelated monitors already selected for publication.

The generated monitor records receive new database identifiers
after regeneration.

### Safety restrictions

The command:

- Requires `DEBUG=True`.
- Requires the existing portfolio account.
- Rejects collisions with reserved demonstration URLs.
- Does not delete or recreate the user.
- Does not execute external HTTP requests.
- Leaves synthetic monitors without a scheduled next check.
- Identifies its historical measurements as synthetic.

Use this command only in a development environment.

### Screenshot preparation

The README references these files:

```text
docs/screenshots/01-dashboard.png
docs/screenshots/02-monitor-detail.png
docs/screenshots/03-public-status.png
docs/screenshots/04-monitor-settings.png
docs/screenshots/05-spanish-ui.png
```

Capture the real application after generating the dataset.

Recommended views:

1. Dashboard with aggregate metrics and monitor states.
2. API Gateway detail with 30-day history.
3. Public status page showing selected services.
4. Monitor configuration form.
5. Dashboard or monitor detail in Spanish.

Use a consistent desktop viewport, and avoid exposing secrets,
browser notifications or unrelated personal data.

Do not represent the synthetic history as production measurements.

## 7. Development testing

### Backend

Run the Django system check:

```powershell
docker compose exec backend python manage.py check
```

Check for unexpected migrations:

```powershell
docker compose exec backend python manage.py makemigrations --check --dry-run
```

Run Ruff:

```powershell
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
```

Run the complete backend test suite:

```powershell
docker compose exec backend pytest -q
```

Run the demonstration tests separately:

```powershell
docker compose exec backend pytest monitors/test_seed_demo.py -q
```

### Frontend

```powershell
docker compose exec frontend npm run lint
docker compose exec frontend npm test
docker compose exec frontend npm run build
```

### CI

GitHub Actions runs checks for pushes to `main`, pull requests
targeting `main` and manual workflow dispatches.

The backend workflow includes Django checks, migration checks,
Ruff, static asset collection and pytest.

The frontend workflow includes ESLint, Vitest and the production
build.

All required checks should pass before a pull request is merged.

## 8. Production deployment

### 8.1. Scope

The production Compose configuration runs:

- PostgreSQL.
- Redis.
- Django through Gunicorn.
- Celery Worker.
- Celery Beat.
- Compiled React assets through Nginx.

The frontend container publishes HTTP only on the host loopback
interface by default.

An external trusted HTTPS reverse proxy must forward traffic
to this internal listener.

### 8.2. Prepare configuration

Create the production environment file:

```powershell
Copy-Item .env.production.example .env.production
```

Before deployment:

1. Generate independent random values for `DJANGO_SECRET_KEY`,
   `JWT_SIGNING_KEY` and `POSTGRES_PASSWORD`.
2. Set `DJANGO_DEBUG=False`.
3. Replace the example hostname with the actual production domain.
4. Set valid `DJANGO_ALLOWED_HOSTS`, CORS and CSRF origins.
5. Configure the trusted HTTPS proxy.
6. Verify that cookies require HTTPS.
7. Keep `.env.production` out of version control.
8. Review all placeholder values before starting.

The sample environment file must not be deployed unchanged.

### 8.3. HTTPS reverse proxy

The Compose file exposes the frontend listener on:

```text
127.0.0.1:8080
```

The actual host port is configurable through
`PULSECHECK_HTTP_PORT`.

The external reverse proxy must:

- Terminate HTTPS using a trusted certificate.
- Forward requests to the private Nginx listener.
- Overwrite untrusted `X-Forwarded-Proto` values.
- Overwrite untrusted `X-Forwarded-For` values.
- Forward the normalized client IP.
- Apply appropriate edge-level request and traffic limits.

The included Nginx configuration forwards `/api/` and `/admin/`
to Django and serves the compiled React application.

Do not expose the internal HTTP listener directly to the Internet
when proxy-trust settings are enabled.

Enable HSTS only after verifying that HTTPS works consistently
for the intended hostname.

### 8.4. Validate configuration

```powershell
docker compose --env-file .env.production -f compose.production.yml config
```

Inspect the resolved configuration privately.

Do not paste its output publicly: rendered environment values may
contain secrets.

### 8.5. Build and start

```powershell
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

Inspect running services:

```powershell
docker compose --env-file .env.production -f compose.production.yml ps
```

Inspect logs:

```powershell
docker compose --env-file .env.production -f compose.production.yml logs backend worker beat --tail 100
```

The backend applies database migrations before starting Gunicorn.

Production static files are collected during the backend image build.

The React frontend is compiled into static assets and served
through Nginx.

### 8.6. Production verification

Through the configured HTTPS hostname:

- Confirm the React application loads.
- Check `/api/health/`.
- Check `/api/health/ready/`.
- Verify login, registration and refresh behavior.
- Create an HTTP monitor.
- Execute a manual check.
- Inspect scheduled check execution in worker logs.
- Confirm historical metrics become available.
- Publish a public status page.
- Open the public page without authenticating.
- Verify language switching.
- Verify that private and reserved monitoring targets are rejected.
- Verify secure cookie and HTTPS settings.

The readiness endpoint checks PostgreSQL and Redis.

It does not prove that every scheduled task or external monitoring
destination is healthy.

## 9. Scheduled execution

Celery Beat dispatches due monitors at approximately 30-second
intervals.

The dispatcher claims eligible monitors and places execution
tasks on the broker.

Celery workers perform the actual HTTP checks.

The application also schedules a daily raw-result retention task.

Only one Beat scheduler should manage a given deployment's
periodic schedule.

Running multiple independent Beat instances can lead to
duplicate scheduled submissions.

## 10. Security considerations

### Secrets

Never commit:

- `.env`
- `.env.production`
- Database passwords.
- JWT signing keys.
- Access or refresh tokens.
- Production backup files containing sensitive data.

Use independent secrets for Django, JWT and PostgreSQL.

### HTTP monitoring

The target validation layer rejects internal/reserved addresses,
validates DNS answers and checks redirect destinations.

Additional production controls should include restrictive outbound
network rules and appropriate isolation of the monitoring workers.

### Rate limiting

Redis-backed throttling is shared across Django workers.

It helps manage abuse but does not replace WAF or edge-level
DDoS protections.

### Browser security

Use HTTPS and Secure cookies in production.

Refresh tokens are stored in HttpOnly cookies; access tokens
are used to authenticate API requests.

CORS and trusted proxy configuration must match the real
deployment topology.

### Database access

Do not expose PostgreSQL or Redis directly to the public Internet.

Grant only the access required by the application and operators.

## 11. Backups and recovery

PostgreSQL contains the authoritative monitoring history and
application configuration.

A production backup strategy should include:

- Scheduled PostgreSQL backups using `pg_dump` or a managed
  equivalent.
- Off-host storage.
- Restricted access to backup archives.
- Retention and restoration procedures.
- Regular restoration tests.

Docker volumes alone are not backups.

Redis does not replace PostgreSQL historical persistence.

Before performing schema migrations or significant upgrades,
create and verify an appropriate backup.

Never test destructive restore procedures against an active
production database.

## 12. Upgrades and rollback

### Upgrade procedure

1. Review the release changes.
2. Check dependency and migration compatibility.
3. Back up PostgreSQL.
4. Build the new images.
5. Start services.
6. Confirm migrations completed.
7. Run health checks and smoke tests.
8. Inspect worker and Beat logs.

### Rollback considerations

Returning to an older Git commit does not automatically reverse
database migrations.

A safe rollback may require:

- Stopping background processing.
- Restoring a compatible image revision.
- Restoring a verified database backup.
- Rechecking application state and scheduled tasks.

Plan migrations for backward compatibility where possible.

Do not delete production volumes as a rollback strategy.

## 13. Troubleshooting

### Backend cannot reach PostgreSQL

Check the `db` service, credentials, database name and
`POSTGRES_HOST=db` setting.

```powershell
docker compose ps
docker compose logs db backend --tail 100
```

### Redis connection errors

Containers must connect through the Compose service name
`redis`, not `localhost`.

Verify:

```env
REDIS_URL=redis://redis:6379/0
DJANGO_CACHE_URL=redis://redis:6379/2
```

Inspect logs:

```powershell
docker compose logs redis backend worker --tail 100
```

### Monitors are not being checked

Verify that:

- Celery Worker is running.
- Celery Beat is running.
- Redis is reachable.
- The monitor is enabled.
- `next_check_at` contains a due timestamp.
- The monitoring target is permitted by the target policy.

Synthetic demo monitors intentionally use `next_check_at=None`.
They are not meant to run automatically.

### Metrics seem incomplete

The 24-hour metric view uses individual raw checks.

Longer periods use daily aggregates.

Raw data may have been deleted according to the monitor's
retention policy, while the daily history remains available.

### The public page returns 404

Confirm that:

- The page is enabled.
- The slug is correct.
- The frontend is using `/status/{slug}`.
- The backend endpoint is `/api/public/status/{slug}/`.

A disabled page intentionally returns 404.

### Frontend changes do not appear

Rebuild the development frontend if dependencies or its
Docker environment have changed:

```powershell
docker compose up -d --build frontend
```

Review the browser console and frontend logs.

## 14. MVP release checklist

Before creating the initial stable MVP release:

- [ ] Synthetic demonstration tests pass.
- [ ] Full backend suite passes.
- [ ] Frontend tests, lint and build pass.
- [ ] Django migration check passes.
- [ ] All README screenshots exist.
- [ ] Screenshots match the real frontend.
- [ ] README instructions work from a clean environment.
- [ ] Technical documentation matches the current implementation.
- [ ] Environment example files contain no production secrets.
- [ ] Licensing terms have been selected and included.
- [ ] GitHub About and topics accurately describe the project.
- [ ] Pull request CI is green.
- [ ] B14 is merged into `main`.
- [ ] The intended version tag points to the validated commit.
- [ ] The GitHub Release describes the MVP accurately.
- [ ] LinkedIn project materials link to the completed repository.

Do not tag or announce an incomplete release.

## 15. Known limitations

The provided Compose deployment is single-host and does not
automatically provision:

- DNS records.
- Public HTTPS certificates.
- External reverse proxy infrastructure.
- Managed backups.
- High availability.
- Production alerting and notification channels.

These operational responsibilities remain with the deployment
operator and are outside the current MVP.