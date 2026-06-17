# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The golden rule

**Every React component must exist in Storybook (with a `*.stories.tsx`) before it is used in the app.** Build the isolated brick — its states/variants under the "felted" design system — validate it in Storybook, then compose it into screens. Do not wire a component into a page if it has no story.

## Commands

```bash
npm run storybook       # design system on :6006 (primary dev surface)
npm run dev             # the app (Vite)
npm run build           # tsc --noEmit + vite build (PWA)
npm run build-storybook # static Storybook — also the de-facto "does everything compile?" check
npx tsc --noEmit        # type-check only
```

There is **no test runner and no linter** configured. The compile gate is `tsc` (strict mode, incl. `noUnusedLocals`/`noUnusedParameters`); run `npm run build` and `npm run build-storybook` to verify changes — both must exit 0.

## What this is

PinkPhone (displayed in-app as "Pink Phone") is an intimate PWA for couples (MVP: exclusive couple, but data model is multi-partner ready). Three MVP features: **Blog** (intimate journal), **Mood** (a shared "sexual weather" indicator), **Défis** (challenges with a state machine). Distributed as a PWA, deliberately outside app stores.

Stack: React 18 + TypeScript + Tailwind v3 + `vite-plugin-pwa`, Storybook (`@storybook/react-vite`) for the frontend; a **Rust/Axum + Postgres** backend lives in `backend/` (see `backend/README.md`). The running app talks to the API (`src/api/`, `src/auth/`, `src/app/`); `src/mock/data.ts` now only feeds Storybook stories.

## Architecture

The frontend is layered strictly **presentational components → screens → orchestration**. Presentational pieces stay API-agnostic and live in Storybook; the orchestration layer (`src/app/`, `src/api/`, `src/auth/`) is the only place that touches the network and holds app state — it is *not* in Storybook, same category as `App.tsx`.

- `src/components/<Name>/` — reusable, presentational, controlled components. No data fetching, no global state; everything comes via props with callbacks for events. Each ships with a `.stories.tsx`. Foundations (`Surface`, `Button`, `Badge`, `Sheet`, `form/*`) are composed by feature components (`SafeMedia`, `MoodSelector`, `ReactionBar`, `VerdictPicker`, `BlogPost`, `ChallengeCard`, `PostComposer`, `ChallengeComposer`).
- `src/screens/<Name>/` — full screens (`Auth`, `Onboarding`, `Dashboard`, `Blog`, `Challenges`, `Splash`) plus `AppShell` + `BottomNav`. Presentational: they take data + handlers and map them onto components. They have stories.
- `src/app/` — stateful orchestration: `Root` (auth gate) → `SpaceGate` (load spaces / onboarding) → `SpaceApp` (loads moods/posts/challenges for a space, wires screen callbacks to API mutations). `App.tsx` just wraps `Root` in `AuthProvider`.
- `src/api/` — typed fetch client (`client.ts`, `types.ts`). Base URL from `VITE_API_URL` (default `http://localhost:8080`). `setToken` injects the JWT. Media: `uploadMedia` (multipart) and `fetchMediaObjectUrl` (authed blob → object URL, fed to `SafeMedia`'s `loader`).
- `src/auth/AuthContext.tsx` — token (localStorage `pp_token`) + current user; `useAuth()`.
- `src/mock/data.ts` — sample data used **only by stories** now (and the shared `PostData`/`ChallengeData`/`Person` types that `SpaceApp` maps onto).
- `src/lib/cn.ts` (classnames), `src/lib/time.ts` (`relativeTime`).

Reactions, verdicts and comments are persisted (migration `0002`, `routes/interactions.rs`); `listPosts` returns each post enriched with `reactionCounts`/`myReactions`/`verdict`/`commentCount`, and `SpaceApp` calls the API directly (no local overlay). The dev server runs on `:5173`, which the backend CORS allows by default.

Auth: email/password (Argon2id) **and** OIDC/SSO (`routes/oidc.rs`, manual Authorization Code + PKCE, confidential client, full `id_token` validation via JWKS). Both toggle independently: `PASSWORD_AUTH_ENABLED=false` disables password (register/login → 403), OIDC enables when `OIDC_*` env is set. `GET /api/auth/config` tells the frontend which to show; OIDC success redirects to the frontend with `#token=` (handled in `AuthContext`). Migration `0004`: `password_hash` nullable + `oidc_sub`. Logout: `useAuth().logout` (gear → Réglages).

Notifications (migration `0003`): per-user mode `push`/`digest`/`ghost` (`user_settings`). `notifications::notify_members` sends **Web Push** (crate `web-push`, hyper-client, best-effort spawned task) on new post/challenge/comment to other space members in `push` mode, using `push_subscriptions`; VAPID keys via `VAPID_*` env (empty ⇒ disabled). Frontend: `injectManifest` SW (`src/sw.js`, handles `push`/`notificationclick`), `src/push.ts` (permission + subscribe), `SettingsScreen` (mode picker + logout, reached via the dashboard gear). **Email digest delivery is not implemented yet** (mode is storable; needs SMTP + a scheduled job).

### Domain enums mirror the backend

Each domain type lives in its own `.ts` next to its component and is meant to stay aligned with future Rust enums: `ChallengeStatus` + `Intensity` (`challenge.ts`), `MoodId` (`moods.ts`), `ReactionId` (`ReactionBar.tsx`), `Verdict` (`VerdictPicker.tsx`). When changing these, treat them as a shared contract with the backend.

The **challenge state machine** is central: `proposed → challengeAccepted | maybeMaybe → jobDone`. `ChallengeCard` renders different actions per state and per `perspective` (`recipient` vs `proposer`).

### Multi-ready data model (backend, in `backend/`)

Content belongs to a `Space` (max 2 users in V1, more later), never directly to a user: `users → space_memberships → spaces`, then moods/posts/challenges/media keyed by `space_id`. Built with Axum + Tokio, JWT auth, Argon2id, `sqlx` (Postgres, **runtime queries** so `cargo build` needs no live DB), `uuid`, `chrono`. `routes::ensure_member` is the per-request authorization guard. Status/mood/intensity values are stored as TEXT matching the frontend strings 1:1 (`challengeAccepted`, `veryHot`, …); `models::challenge_transition_allowed` encodes the state machine. Media is served only through an **authenticated streaming route** (token + space membership) — never from `/public`; files stored under UUIDs in `MEDIA_DIR`, with an optional `viewOnce` ephemeral mode (deleted + marked consumed after one read).

Backend commands (run in `backend/`): `cargo build` / `cargo run` (applies migrations on start); `docker-compose up -d` for Postgres. There is no Rust test suite yet — `cargo build` is the gate.

### Deployment

The **web image** (`Dockerfile`) is nginx serving the PWA **and** reverse-proxying `/api` (incl. the WebSocket upgrade) → the api service, so production is same-origin (no CORS; built with `VITE_API_URL=""` → relative `/api`). `deploy/docker-compose.yml` runs db + api + web; only `web` is exposed — put a reverse proxy in front for domain + TLS. Public images are published to Docker Hub (`pinkphone/pinkphone-{api,web}`) by the manual GitHub release workflow (`.github/workflows/release.yml`); the API applies migrations on startup. Keep `JWT_SECRET` stable (changing it invalidates all sessions) and set all four `OIDC_*` for SSO (`oidc_enabled()` needs them non-empty). Self-hosting guide: `INSTALL.md` (+ `deploy/README.md`).

## Design system — "felted"

Skeuomorphic, soft, warm — **not** flat-and-cold, **not** candy/barbie pink, **not** clinical or explicit. All tokens live in `tailwind.config.js`; the app is dark-only (charcoal background), so use the palette directly (no `dark:` variants are configured).

- Colors: `blush` (light card fills) → `spice` (primary accent) → `bordeaux` (hot/active states); neutrals `charcoal` (bg) and `taupe` (text).
- Fonts: `font-serif` = Playfair Display (titles), `font-sans` = Inter (body), loaded offline via `@fontsource` in `src/index.css`.
- Shapes/feel: generous rounding (`rounded-2xl`/`3xl`), soft shadows (`shadow-felt`, `shadow-glow`), subtle textures (`bg-felt-velvet`/`bg-felt-linen`), slow transitions (`ease-felt`). Active controls get a soft glow, not a flat color swap.
- Security as sensuality: media is blurred by default and revealed by press-and-hold (`SafeMedia`) — keep that gesture, don't reduce it to a toggle.

Mobile-first: respect safe-area insets; Storybook defaults to a mobile viewport and charcoal background.

PWA install: the manifest (in `vite.config.ts`) + `injectManifest` SW + icons in `public/` (`pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png`, regenerated from an SVG via `rsvg-convert`) make it installable. `src/app/InstallPrompt.tsx` shows an in-app banner (`InstallBanner`): native prompt on Android (`beforeinstallprompt`), manual instructions on iOS (no native prompt; relies on `apple-mobile-web-app-*` meta in `index.html`).
