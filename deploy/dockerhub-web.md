# Pink Phone — Web

Frontend (nginx + the React PWA) for **[Pink Phone](https://github.com/pink-phone/pink-phone)**, an intimate, self-hosted PWA for two: a shared journal, a daily "weather of desire", and playful dares. Outside the app stores, no third parties — you host it, your data stays on your server.

This image is **one half** of the stack. It is not meant to run alone — use the Compose file below, which also brings up Postgres and the API image.

- 🌸 **App & source:** https://github.com/pink-phone/pink-phone
- 🖼️ **Landing:** https://pink-phone.github.io/pink-phone/
- 🐳 **API image:** [`pinkphone/pinkphone-api`](https://hub.docker.com/r/pinkphone/pinkphone-api)
- 📦 **Architectures:** `linux/amd64`, `linux/arm64`
- 🏷️ **Tags:** `latest` + semver (`vX.Y.Z`)
- 📄 **License:** AGPL-3.0

## What it does

nginx serving the installable **PWA** (service worker, offline fonts, dark "felted" UI) **and** reverse-proxying `/api` — including the WebSocket upgrade — to the `api` service. So everything is **same-origin** (no CORS). Listens on **:80** inside the container.

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

This is the **only service you expose** (default host port `8095` → container `80`). Put a reverse proxy in front for your domain + TLS; make sure it forwards the WebSocket upgrade headers on `/api`. Full guide: **[INSTALL.md](https://github.com/pink-phone/pink-phone/blob/main/INSTALL.md)**.

## Ports & wiring

This image is **static** — it has **no runtime environment variables** (all configuration lives on `pinkphone-api`). What matters for wiring it up:

| | |
|---|---|
| **Listens on** | `80` (container). Map it to a host port — the Compose file uses `WEB_PORT`, default `8095`. |
| **Upstream** | proxies `/api` (incl. the WebSocket `…/ws`) to **`http://api:8080`** (hard-coded) → the API must be reachable as host **`api`** on the same Docker network. |
| **Max upload** | `100 MB` (matches the API's media limit). |
| **Reverse proxy** | put one in front for your domain + TLS, and forward the WebSocket upgrade headers on `/api`. |

## Notes

- Built same-origin (`VITE_API_URL=""` → relative `/api`), so no extra config to point the PWA at the API.
- Pair the tag with the matching `pinkphone-api` tag (the Compose file uses `IMAGE_TAG`, default `latest`).
