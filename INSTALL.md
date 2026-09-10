# Self-hosted installation

Pink Phone self-hosts with **Docker Compose**: Postgres + the Rust API + an nginx that serves the PWA **and** reverse-proxies `/api` (everything same-origin, no CORS). Published images are pulled from Docker Hub — **no local build required**.

## 0. Just want to try it? (local, zero config)

```bash
git clone https://github.com/pink-phone/pink-phone.git pinkphone && cd pinkphone/deploy
docker compose -f docker-compose.local.yml up
```

Open **http://localhost:8095** and register. No `.env`, no secrets, no proxy.

> ⚠️ Local only: throwaway secrets, unencrypted media, no push (needs HTTPS). For real use, follow the steps below.

## 1. Prerequisites

- Docker + Docker Compose v2.
- A reverse proxy in front for **domain + TLS** (nginx, Caddy, Traefik…). Required for the PWA (service worker, push), which needs HTTPS.

## 2. Get the deployment files

You only need `docker-compose.yml` and `.env.example` from the `deploy/` folder:

```bash
git clone https://github.com/pink-phone/pink-phone.git pinkphone && cd pinkphone/deploy
# (or just download deploy/docker-compose.yml and deploy/.env.example)
cp .env.example .env
```

## 3. Configure `.env`

| Variable | Purpose | How to generate |
|---|---|---|
| `JWT_SECRET` | **Required.** Signs session tokens (keep it stable!) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | **Required.** Database password | `openssl rand -base64 24` |
| `MEDIA_KEY` | Encrypts media at rest (AES-256-GCM). Empty = plaintext. **Never change it later.** | `openssl rand -base64 32` |
| `WEB_PORT` | Host port exposed (reverse-proxy target) | default `8095` |
| `API_IMAGE` / `WEB_IMAGE` | Image names. Default to `pinkphone/pinkphone-api` / `…-web` on Docker Hub | override to use another registry/namespace |
| `IMAGE_TAG` | Image version | default `latest` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (notifications). Empty = push disabled | `npx web-push generate-vapid-keys` |
| `PASSWORD_AUTH_ENABLED` | Email/password auth (`false` = SSO only) | default `true` |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` / `OIDC_POST_LOGIN_REDIRECT` | SSO/OIDC (all required if enabled) | from your provider |

The OIDC callback lives on the public domain: `https://your-domain/api/auth/oidc/callback`.

## 4. Start the stack (Docker Hub images)

The provided `deploy/docker-compose.yml` already references the published images:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pink
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
      POSTGRES_DB: pinkphone
    volumes: [pink-pgdata:/var/lib/postgresql/data]
    networks: [pink]

  api:
    image: ${API_IMAGE:-pinkphone/pinkphone-api}:${IMAGE_TAG:-latest}
    depends_on: [db]
    environment:
      DB_HOST: db
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      JWT_SECRET: ${JWT_SECRET:?}
      BIND_ADDR: 0.0.0.0:8080
      MEDIA_DIR: /data/media
      MEDIA_KEY: ${MEDIA_KEY:-}
      # …VAPID_* / PASSWORD_AUTH_ENABLED / OIDC_* (see deploy/docker-compose.yml)
    volumes: [pink-media:/data/media]
    networks: [pink]

  web:
    image: ${WEB_IMAGE:-pinkphone/pinkphone-web}:${IMAGE_TAG:-latest}
    depends_on: [api]
    ports: ["${WEB_PORT:-8095}:80"]
    networks: [pink]

networks: { pink: {} }
volumes: { pink-pgdata: {}, pink-media: {} }
```

```bash
docker compose up -d        # pulls the images, no build
```

- The API **runs migrations on startup** (no manual step).
- The API refuses to start if it's exposed with a dev `JWT_SECRET` **or one shorter than 32 characters** — by design.

## 5. Reverse proxy (TLS) — example (nginx)

Point your proxy at the `web` container (`http://<host>:${WEB_PORT}`). Real-time uses a WebSocket (`/api/spaces/{id}/ws`), so the proxy **must forward the upgrade**:

```nginx
# WebSocket upgrade switch (http context)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name pinkphone.example.com;

    ssl_certificate     /etc/letsencrypt/live/pinkphone.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pinkphone.example.com/privkey.pem;

    client_max_body_size 25m;          # media uploads (≈20 MB)

    location / {
        proxy_pass http://127.0.0.1:8095;   # the `web` container (WEB_PORT)
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;   # WebSocket
        proxy_read_timeout 3600s;                          # keep idle WS alive
    }
}

server {
    listen 80;
    server_name pinkphone.example.com;
    return 301 https://$host$request_uri;
}
```

(Caddy/Traefik handle the WebSocket upgrade automatically — just proxy to the `web` container.)

## 6. First run

Open the app via your HTTPS domain, create an account, create a **space**, then share its ID with your partner so they can join. Install the PWA ("Add to Home Screen").

## Backups & security

- Back up the **`pink-pgdata`** volume (database) and **`pink-media`** (files).
- Media is encrypted at rest **if** `MEDIA_KEY` is set; **Postgres metadata stays in plaintext** → for full protection against disk access, encrypt the volume at the OS level (e.g. LUKS).
- Keep `JWT_SECRET` **stable** (changing it logs everyone out). Don't change `MEDIA_KEY` casually (it makes media unreadable) — but you **can** migrate to a new key with the rotation command below.
- If you set `MEDIA_KEY` **after** media already exist (they're stored in plaintext), encrypt them in place once with the maintenance command (safe & re-runnable; only touches still-plaintext files):
  ```bash
  docker exec <api-container> pinkphone-api backfill-media-encryption
  ```
- **Rotating `MEDIA_KEY`** (move all media from the current key to a new one): the command decrypts with the running `MEDIA_KEY` and re-encrypts with `MEDIA_KEY_NEW`. Safe & re-runnable (already-rotated files are detected and skipped).
  ```bash
  NEW=$(openssl rand -base64 32)
  docker exec -e MEDIA_KEY_NEW="$NEW" <api-container> pinkphone-api rotate-media-key
  # then set MEDIA_KEY = "$NEW" in your secrets and redeploy. Back up the new key.
  ```

## Admin CLI (pinkctl)

`pinkctl` is a separate binary in the same image, for account/space support tasks (create/reset-password/delete a user, create/rename/delete a space or remove one member, list migrations, prune/verify media, list push subscriptions, toggle a catalog item) without going through the app. It talks to Postgres directly — no HTTP, no server, no listening port of its own. `--json` on any `list` subcommand switches to machine-readable output.

- **Docker-exec only, never expose it over the network.** There is no login for `pinkctl` itself, and there shouldn't be one: whoever can run it already has `DATABASE_URL`/`DB_PASSWORD` (often `JWT_SECRET`/`MEDIA_KEY` too) via the container's environment, so a password prompt inside the CLI wouldn't create a real second boundary — it would just be a second thing to get right. The actual boundary is **who can reach a shell on the host/container**: SSH keys + `docker`-group membership. Run it via:
  ```bash
  docker exec -it <api-container> pinkctl --help
  ```
  For a remote host, that means SSH in first, then `docker exec` — not a bespoke network-facing admin port. Don't build a wrapper (web terminal, RPC, exposed port) that lets `pinkctl` be invoked over the network; that would add a new, custom-authenticated attack surface to an app that stores intimate data for two real people, for no real gain over SSH.
- On a deployment `pinkctl` considers "exposed" (`BIND_ADDR` not loopback — the same heuristic the server's startup guard uses), it refuses `user create --password <pw>` / `user reset-password --password <pw>`: a password passed as an argument sits in the shell history and in `ps`/`/proc` for anyone else with shell access to that host. Omit `--password` and it prompts for a hidden input instead. On a local/dev loopback setup (`docker-compose.local.yml`), `--password` is allowed for convenience.
- `user delete`/`media prune --apply` are irreversible and require `--confirm`/`--apply` explicitly — there's no interactive "are you sure?" prompt, so double-check the target before adding that flag.
- **`pinkctl nuke`** wipes the entire instance — every user, space, post, challenge, mood, and media file on disk — for a full reset. The catalog (bucket list / evening menu content) and the global challenge bank are never touched (they're reference content, not user data). Run it bare first to see the counts of what would be deleted without touching anything:
  ```bash
  docker exec -it <api-container> pinkctl nuke
  docker exec -it <api-container> pinkctl nuke --confirm NUKE-EVERYTHING   # actually does it
  ```
  It takes the literal phrase `NUKE-EVERYTHING`, not a plain `--confirm` flag — on purpose, so a reflexive/copy-pasted `--confirm` from another command can't trigger it by accident.
