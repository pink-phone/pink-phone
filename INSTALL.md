# Self-hosted installation

Pink Phone self-hosts with **Docker Compose**: Postgres + the Rust API + an nginx that serves the PWA **and** reverse-proxies `/api` (everything same-origin, no CORS to deal with).

> The repo's `deploy/docker-compose.yml` pulls images from a private registry (Forgejo CI). For a **from-source** deploy, use the compose below (local build). Once a public image pipeline is in place, you'll be able to point at published images.

## 1. Prerequisites

- Docker + Docker Compose v2.
- (Recommended) a front reverse proxy for **domain + TLS** (Traefik, Caddy, nginx…). Required for the PWA (service worker, push), which needs HTTPS.

## 2. Get the code

```bash
git clone <repo> pinkphone && cd pinkphone
```

## 3. Configure the environment

Copy the example and fill in the values:

```bash
cp deploy/.env.example .env
```

| Variable | Purpose | How to generate |
|---|---|---|
| `JWT_SECRET` | **Required.** Signs session tokens (keep it stable!) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | **Required.** Database password | `openssl rand -base64 24` |
| `MEDIA_KEY` | Encrypts media at rest (AES-256-GCM). Empty = plaintext. **Never change it later.** | `openssl rand -base64 32` |
| `WEB_PORT` | Host port exposed (reverse-proxy target) | default `8095` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (notifications). Empty = push disabled | `npx web-push generate-vapid-keys` |
| `PASSWORD_AUTH_ENABLED` | Email/password auth (`false` = SSO only) | default `true` |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` / `OIDC_POST_LOGIN_REDIRECT` | SSO/OIDC (all required if enabled, otherwise SSO is off) | from your provider (Authentik, Keycloak…) |

The OIDC callback lives on the public domain: `https://your-domain/api/auth/oidc/callback`.

## 4. Compose (build from source)

Create a `docker-compose.yml` (or adapt `deploy/docker-compose.yml`, replacing `image:` with `build:`):

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: pink
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
      POSTGRES_DB: pinkphone
    volumes: [pink-pgdata:/var/lib/postgresql/data]
    networks: [pink]

  api:
    build: { context: ./backend }
    restart: unless-stopped
    depends_on: [db]
    environment:
      DB_HOST: db
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      JWT_SECRET: ${JWT_SECRET:?}
      BIND_ADDR: 0.0.0.0:8080
      MEDIA_DIR: /data/media
      MEDIA_KEY: ${MEDIA_KEY:-}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-mailto:admin@example.com}
      PASSWORD_AUTH_ENABLED: ${PASSWORD_AUTH_ENABLED:-true}
      OIDC_ISSUER: ${OIDC_ISSUER:-}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:-}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:-}
      OIDC_REDIRECT_URI: ${OIDC_REDIRECT_URI:-}
      OIDC_POST_LOGIN_REDIRECT: ${OIDC_POST_LOGIN_REDIRECT:-}
    volumes: [pink-media:/data/media]
    networks: [pink]

  web:
    build: { context: ., dockerfile: Dockerfile }
    restart: unless-stopped
    depends_on: [api]
    ports: ["${WEB_PORT:-8095}:80"]
    networks: [pink]

networks: { pink: {} }
volumes: { pink-pgdata: {}, pink-media: {} }
```

```bash
docker compose up -d --build
```

- The API **runs migrations on startup** (no manual step).
- The API refuses to start if it's exposed with a dev `JWT_SECRET` — by design.

## 5. Reverse proxy (TLS) — ⚠️ WebSocket

Point your proxy at `http://<host>:${WEB_PORT}`. Real-time relies on a WebSocket (`/api/spaces/{id}/ws`): the front proxy **must forward the WebSocket upgrade** (most do; Traefik automatically; for nginx, propagate `Upgrade`/`Connection`). The image's internal nginx already handles the upgrade and a long `proxy_read_timeout` (see `deploy/web-nginx.conf`).

## 6. First run

Open the app via your HTTPS domain, create an account, create a **space**, then share its ID with your partner so they can join. Install the PWA ("Add to Home Screen").

## Backups & security

- Data to back up: the **`pink-pgdata`** volume (database) and **`pink-media`** (files).
- Media is encrypted at rest **if** `MEDIA_KEY` is set; **Postgres metadata stays in plaintext** → for full protection against disk access, encrypt the volume at the OS level (LUKS).
- Keep `JWT_SECRET` **stable** (changing it logs everyone out) and `MEDIA_KEY` **immutable** (changing it makes media unreadable).
