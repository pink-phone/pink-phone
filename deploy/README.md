# Deployment files

Helpers for a production, self-hosted deployment. Full step-by-step guide:
[`../INSTALL.md`](../INSTALL.md).

## Files

- **`docker-compose.yml`** — production stack: `db` (Postgres) + `api` + `web`.
  Only `web` is exposed on the host; put a reverse proxy in front for domain + TLS.
  Images default to Docker Hub (`pinkphone/pinkphone-{api,web}`); override
  `API_IMAGE` / `WEB_IMAGE` / `IMAGE_TAG` to use another registry or version.
- **`.env.example`** — all environment variables (copy to `.env` and fill in).
- **`web-nginx.conf`** — the nginx config baked into the `web` image: serves the
  PWA and reverse-proxies `/api` (incl. the WebSocket upgrade) to the `api`
  service, so everything is same-origin (no CORS).

## Quick start

```bash
cp .env.example .env     # then edit (generate JWT_SECRET, POSTGRES_PASSWORD, MEDIA_KEY…)
docker compose up -d
```

The API runs its migrations on startup. Point your reverse proxy at
`http://<host>:${WEB_PORT}` and make sure it forwards the **WebSocket** upgrade
on `/api/spaces/*/ws` (needed for real-time). See [`../INSTALL.md`](../INSTALL.md)
for the reverse-proxy example, key generation and backups.
