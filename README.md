# Pink Phone 🔥

**A couple's secret garden.** An intimate PWA — not a dating app, not a social network — just for two. A laid-back shared journal, a "weather of desire", and playful dares. Shipped as a PWA, deliberately **outside the app stores**, self-hostable.

> Mobile-first, dark, with a "felted" art direction (soft skeuomorphism, desaturated rose, velvet) — neither flat-and-cold, nor candy pink, nor clinical.

## ✨ Features

- **Blog** — a shared journal: stories, photos, emoji reactions (including a **free/custom reaction**), comments. **Drafts** (text + photo, editable), and editing of published posts.
- **Mood** — the daily "weather of desire": a mood shared in one tap, reset at midnight (the space's timezone). A hot/playful mood gently *nudges* the other (notification).
- **Dares** — a small state machine (`proposed → accepted / to adjust → mission accomplished`), with a curated **suggestion bank** (FR/EN) plus space-specific suggestions (CRUD).
- **Sensual & safe media** — blurred by default, revealed by *press-and-hold*; **ephemeral** ("view once") mode. **Encryptable at rest** (AES-256-GCM) and served only through an authenticated route.
- **Real-time** — WebSocket: new content, moods, reactions and **read receipts** ("✓✓ Seen") sync live. "What's new" badges on the home screen.
- **Themes** — "Felted" (default) and "Red Velvet", via CSS variables.
- **Bilingual** — FR / EN (react-i18next, browser detection, switcher in settings).
- **Installable PWA** — manifest + service worker, Android install (native prompt) / iOS (instructions), auto-reload on update, Android hardware back & iOS swipe-back.
- **Auth** — email/password (Argon2id) **and/or** OIDC/SSO.

## 🖼️ Screenshots

> _To add under `docs/screenshots/` and reference here (Dashboard, Blog, Dares, Settings…)._

| Home | Journal | Dares |
|---|---|---|
| _(dashboard.png)_ | _(blog.png)_ | _(challenges.png)_ |

## 🧱 Stack

- **Front** — React 18 + TypeScript + Tailwind v3 + `vite-plugin-pwa`. **Storybook** as the design surface (every component lives there before being used).
- **Back** — Rust / **Axum** + Tokio, Postgres via `sqlx` (runtime queries), JWT + Argon2id, Web Push (VAPID), WebSocket.
- **Deployment** — Docker images (nginx web + api), Forgejo Actions CI/CD, behind a reverse proxy (TLS).

## 🚀 Quick start (dev)

```bash
# Front (design system + app)
npm install
npm run storybook        # design system — http://localhost:6006
npm run dev              # app (Vite) — http://localhost:5173

# Back (other terminal) — see backend/README.md
cd backend
cp .env.example .env     # adjust as needed
docker compose up -d     # Postgres :5432
cargo run                # API :8080 (runs migrations on startup)
```

The front-end API URL is configurable via `VITE_API_URL` (default `http://localhost:8080`).

## 📦 Self-hosting

Self-hosted install (Docker Compose, env vars, reverse proxy + WebSocket, key generation): **[`INSTALL.md`](INSTALL.md)**.

## 🤝 Contributing

Prerequisites, commands, conventions and the **Storybook-first golden rule**: **[`CONTRIBUTING.md`](CONTRIBUTING.md)**.

## 🔧 Deployment (CI/CD)

Forgejo Actions pipeline (build → semver release → SSH deploy): **[`deploy/README.md`](deploy/README.md)**.

## 📁 Architecture (overview)

- `src/components/` — reusable, presentational, controlled bricks (each has its `*.stories.tsx`).
- `src/screens/` — presentational screens; `src/app/` — orchestration (state + network, WebSocket).
- `src/api/`, `src/auth/`, `src/i18n/`, `src/theme.ts` — typed client, auth, translations, themes.
- `backend/` — Rust/Axum API (see [`backend/README.md`](backend/README.md)).

`App.tsx` → `AuthProvider` → `Root` (auth) → `SpaceGate` (spaces) → `SpaceApp` (loads the space's mood/posts/dares, WebSocket, wires the screens). `src/mock/data.ts` only feeds the stories.

## 🎨 Art direction — "felted"

Soft skeuomorphism: desaturated roses (Blush → Spice → Bordeaux), warm neutrals (Charcoal, Taupe), serif titles (Playfair) / sans body (Inter), generous rounding, soft shadows, slow transitions. Palette as **CSS variables** (themeable) in `src/index.css`; tokens in `tailwind.config.js`.

## 📝 License

Licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`) — see [`LICENSE`](LICENSE).

In short: you can use, study, share and modify it freely; if you run a modified version as a network service, you must make your source available under the same terms.

Copyright © 2026 Pink Phone contributors.
