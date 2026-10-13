# PulseCheck — production deployment (B12)

This deployment runs Django/Gunicorn, Celery worker/Beat, PostgreSQL, Redis, and a built React SPA served by Nginx. It is not a multi-node HA deployment.

## Requirements

- Docker Engine + Compose plugin.
- A trusted HTTPS reverse proxy on the host or gateway.
- A DNS name pointing to the server.
- Regular backups of the `prod_postgres` volume.

## Configuration

1. Copy `.env.production.example` to `.env.production`.
2. Generate independent random secrets for `DJANGO_SECRET_KEY`,
   `JWT_SIGNING_KEY`, and `POSTGRES_PASSWORD`.
3. Replace `status.example.com` with your actual hostname.
4. Keep `.env.production` outside Git; never publish it.
5. Keep port 8080 private. The Compose file publishes it only on
   `127.0.0.1`. Terminate HTTPS with your trusted reverse proxy.

The external HTTPS proxy MUST overwrite untrusted incoming `X-Forwarded-Proto` and `X-Forwarded-For` headers. It must send `X-Forwarded-Proto: https` and a trusted, normalized client IP in `X-Forwarded-For`. Nginx forwards these headers to Django. Never expose port 8080 directly to the public Internet while the forwarded-header settings are enabled. Set `TRUSTED_PROXY_COUNT` to zero if there is no trusted forwarded-client-IP header.

Only enable HSTS after HTTPS is known to work consistently for the domain. A real certificate, DNS configuration, and HTTPS proxy are external requirements; Compose does not provision them.

## Start and inspect

```powershell
Copy-Item .env.production.example .env.production
# Edit .env.production before running the next command.
docker compose --env-file .env.production -f compose.production.yml config
docker compose --env-file .env.production -f compose.production.yml up -d --build
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs backend worker beat --tail 100
```

The backend applies migrations before Gunicorn starts. Never run two independent Beat instances against the same database/queue.

## Verify

- Open `https://YOUR_HOSTNAME/` and confirm the SPA loads.
- Visit an unknown route: a 404-style page should be rendered by React.
- Open `/api/health/` and `/api/health/ready/` through the HTTPS proxy.
- Register/login, create a public monitor, and run a manual check.
- Publish a status page; verify it anonymously in another browser.
- Inspect Celery worker and Beat logs to confirm scheduled checks.
- Confirm `/api/auth/login/` is rate-limited after repeated failures.
- Verify that private IPs and local metadata URLs cannot be monitored.
- Check that response headers include appropriate HTTPS/HSTS settings.

## Security and operations

- Rate limiting uses the Redis database configured in `DJANGO_CACHE_URL`;
  it is shared across all API workers. The limit is not a substitute for
  proxy/WAF-level DDoS protection.
- Private/reserved targets are blocked, including mixed public/private DNS
  records. HTTP clients connect to a vetted address while preserving Host
  and TLS SNI; redirects are validated independently.
- The configuration version prevents late results from overwriting a
  paused or reconfigured monitor.
- Store database backups off host and perform a restore test. Redis is
  not a source of historical check data; PostgreSQL is.
- Review logs without disclosing JWTs, credentials, or monitored secrets.
- Run dependency/security updates separately and retest before upgrades.

## Rolling back

Do not drop volumes. Restore the previous image/source revision and, if migrations are not backwards-compatible, restore a tested PostgreSQL backup. Stop jobs before manipulating the database. Schema rollbacks must be planned for each migration, not guessed from a code checkout.