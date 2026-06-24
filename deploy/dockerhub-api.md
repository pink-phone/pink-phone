# Pink Phone — API

Backend (Rust / Axum) for **[Pink Phone](https://github.com/pink-phone/pink-phone)**, an intimate, self-hosted PWA for two: a shared journal, a daily "weather of desire", and playful dares. Outside the app stores, no third parties — you host it, your data stays on your server.

This image is **one half** of the stack. It is not meant to run alone — use the Compose file below, which also brings up Postgres and the web image.

- 🌸 **App & source:** https://github.com/pink-phone/pink-phone
- 🖼️ **Landing:** https://pink-phone.github.io/pink-phone/
- 🐳 **Web image:** [`pinkphone/pinkphone-web`](https://hub.docker.com/r/pinkphone/pinkphone-web)
- 📦 **Architectures:** `linux/amd64`, `linux/arm64`
- 🏷️ **Tags:** `latest` + semver (`vX.Y.Z`)
- 📄 **License:** AGPL-3.0

## What it does

Axum + Tokio HTTP/WebSocket server: JWT auth (Argon2id) and optional OIDC/SSO, per-space content (journal, moods, dares, comments, reactions), Web Push, and authenticated media streaming (optionally **encrypted at rest**, AES-256-GCM). Listens on **:8080**. **Runs its database migrations automatically on startup.**

## Run it

Don't pull this image by hand — grab the Compose file (db + api + web) and a few secrets:

```bash
# deploy/docker-compose.yml from the repo
curl -O https://raw.githubusercontent.com/pink-phone/pink-phone/main/deploy/docker-compose.yml

JWT_SECRET=$(openssl rand -base64 48) \
POSTGRES_PASSWORD=$(openssl rand -base64 24) \
MEDIA_KEY=$(openssl rand -base64 32) \
docker compose up -d
```

Only the **web** service is exposed (default host port `8095`) — put a reverse proxy in front for your domain + TLS. Full guide: **[INSTALL.md](https://github.com/pink-phone/pink-phone/blob/main/INSTALL.md)**.

## Key environment variables

| Var | Purpose |
|-----|---------|
| `JWT_SECRET` | **Required.** Stable secret; changing it invalidates all sessions. The API refuses to boot if exposed with the dev default. |
| `DB_HOST` / `DB_PASSWORD` | Postgres connection (the Compose file wires `db`). |
| `MEDIA_DIR` | Where uploaded media is stored (volume). |
| `MEDIA_KEY` | base64 32 bytes → encrypt media at rest. **Never change once set.** Empty = stored in clear. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (empty = disabled). |
| `PASSWORD_AUTH_ENABLED` | `false` disables email/password (OIDC only). |
| `OIDC_*` | Issuer / client id / secret / redirect for SSO (all four required to enable). |

See [`.env.example`](https://github.com/pink-phone/pink-phone/blob/main/deploy) and INSTALL.md for the complete list.
