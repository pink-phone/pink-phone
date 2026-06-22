# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The golden rule

**Every React component must exist in Storybook (with a `*.stories.tsx`) before it is used in the app.** Build the isolated brick — its states/variants under the "felted" design system — validate it in Storybook, then compose it into screens. Do not wire a component into a page if it has no story.

## Commands

The repo has two apps: **`frontend/`** (web) and **`backend/`** (API). Frontend commands run from `frontend/`:

```bash
cd frontend
npm run storybook       # design system on :6006 (primary dev surface)
npm run dev             # the app (Vite)
npm run build           # tsc --noEmit + vite build (PWA)
npm run build-storybook # static Storybook — also the de-facto "does everything compile?" check
npx tsc --noEmit        # type-check only
npm run test            # Vitest (run once); npm run test:watch to watch
npm run screenshots     # regenerate docs/screenshots/* from built Storybook (one-time: npx playwright install chromium)
```

Tests use **Vitest + Testing Library + jsdom** (`vitest.config.ts`, setup `src/test/setup.ts` which boots i18n in `fr`); test files are `*.test.ts(x)` next to the code (pure functions like `app/mappers.ts`, `lib/`, plus component tests via RTL). There is **no linter** configured. The compile gate is `tsc` (strict mode, incl. `noUnusedLocals`/`noUnusedParameters`); run `npm run build`, `npm run build-storybook` and `npm run test` to verify changes — all must exit 0.

## What this is

PinkPhone (displayed in-app as "Pink Phone") is an intimate PWA for couples (MVP: exclusive couple, but data model is multi-partner ready). Three MVP features: **Blog** (intimate journal), **Mood** (a shared "sexual weather" indicator), **Défis** (challenges with a state machine). Distributed as a PWA, deliberately outside app stores.

Stack: React 18 + TypeScript + Tailwind v3 + `vite-plugin-pwa`, Storybook (`@storybook/react-vite`) for the frontend; a **Rust/Axum + Postgres** backend lives in `backend/` (see `backend/README.md`). The running app talks to the API (`src/api/`, `src/auth/`, `src/app/`); `src/mock/data.ts` now only feeds Storybook stories.

## Architecture

The frontend lives in **`frontend/`** (so `src/…` paths below are `frontend/src/…`); the backend lives in **`backend/`**. The frontend is layered strictly **presentational components → screens → orchestration**. Presentational pieces stay API-agnostic and live in Storybook; the orchestration layer (`src/app/`, `src/api/`, `src/auth/`) is the only place that touches the network and holds app state — it is *not* in Storybook, same category as `App.tsx`.

- `src/components/<Name>/` — reusable, presentational, controlled components. No data fetching, no global state; everything comes via props with callbacks for events. Each ships with a `.stories.tsx`. Foundations (`Surface`, `Button`, `Badge`, `Sheet`, `form/*`) are composed by feature components (`SafeMedia`, `MoodSelector`, `ReactionBar`, `VerdictPicker`, `BlogPost`, `ChallengeCard`, `PostComposer`, `ChallengeComposer`).
- `src/screens/<Name>/` — full screens (`Auth`, `Onboarding`, `Dashboard`, `Blog`, `Challenges`, `Splash`) plus `AppShell` + `BottomNav`. Presentational: they take data + handlers and map them onto components. They have stories.
- `src/app/` — stateful orchestration: `Root` (auth gate) → `SpaceGate` (load spaces / onboarding) → `SpaceApp` (the composition root) → `App.tsx` just wraps `Root` in `AuthProvider`. Each domain is a hook in `src/app/hooks/` owning its state + a **stable `refetch`** (`[spaceId]`) + mutations: `usePosts` (posts + comments), `useChallenges`, `useMoods`, `useSeen`, `useSuggestions` (challenge bank), plus `useSpaceSocket` (WS lifecycle). `SpaceApp` keeps the orchestration only: the grouped initial load + `ready` gate, the WS/resync wiring (it calls the hooks' `refetch`), confirm dialogs and sheet open/close, and derivations (partner/blind mood, "new" badge counts). Pure API→view-model conversions live in `src/app/mappers.ts`.
- `src/domain/types.ts` — **neutral layer** holding the domain enums mirrored with Rust (`ChallengeStatus`, `Intensity`, `Verdict`, `ReactionId`, `MoodId`). Both `components/` and `api/` depend on it (the arrow always points *to* the domain); the component files re-export their type for convenience. **This file is GENERATED** from the Rust consts in `backend/src/models.rs` (single source of truth, API-13): the `cargo test` `models::domain_codegen::types_ts_a_jour` regenerates it and fails if it drifted — change a status/mood/reaction value only in `models.rs`, then run `cargo test` and recommit `types.ts`. Don't hand-edit it.
- `src/types/view.ts` — presentation view-models (`Person`, `MoodSnapshot`, `PostData`, `ChallengeData`) that screens take as props and `SpaceApp`/`mappers.ts` build. The mock depends on these, not the reverse.
- `src/api/` — typed fetch client (`client.ts`, `types.ts`). Base URL from `VITE_API_URL` (default `http://localhost:8080`). `setToken` injects the JWT. Media: `uploadMedia` (multipart) and `fetchMediaObjectUrl` (authed blob → object URL, fed to `SafeMedia`'s `loader`).
- `src/auth/AuthContext.tsx` — token (localStorage `pp_token`) + current user; `useAuth()` (also exposes the raw `token` for non-`fetch` uses like the WebSocket URL).
- `src/mock/data.ts` — sample data used **only by stories** now (the view-model types it uses live in `src/types/view.ts`).
- `src/lib/cn.ts` (classnames), `src/lib/time.ts` (`relativeTime`), `src/lib/confirm.ts` (`confirmAction`, the swappable seam over `window.confirm`).

Reactions, verdicts and comments are persisted (migration `0002`, `routes/interactions.rs`); `listPosts` returns each post enriched with `reactionCounts`/`myReactions`/`verdict`/`commentCount`, and `SpaceApp` calls the API directly (no local overlay). The dev server runs on `:5173`, which the backend CORS allows by default.

Auth: email/password (Argon2id) **and** OIDC/SSO (`routes/oidc.rs`, manual Authorization Code + PKCE, confidential client, full `id_token` validation via JWKS). Both toggle independently: `PASSWORD_AUTH_ENABLED=false` disables password (register/login → 403), OIDC enables when `OIDC_*` env is set. `GET /api/auth/config` tells the frontend which to show; OIDC success redirects to the frontend with `#token=` (handled in `AuthContext`). Migration `0004`: `password_hash` nullable + `oidc_sub`. Logout: `useAuth().logout` (gear → Réglages).

### Real-time, "seen" & resync

`SpaceApp` opens a WebSocket (`spaceSocketUrl`, JWT in the query string) and **refetches the relevant list** on each event (`post`/`reaction`/`comment`/`mood`/`seen`/`space`/`challenge`) — events carry no payload, they're just "something changed". It also resyncs everything on focus/`visibilitychange` (the socket does not replay events missed while away). Read state lives in `space_last_seen(user, space, feature)` (features `blog`/`challenges`): it drives both the dashboard "what's new" badges (new posts/comments/challenges, counted client-side from timestamps vs my last-seen) and the "✓✓ Seen" read receipts; opening a tab marks it seen.

### i18n (every user-facing string)

All UI text goes through `t(...)` (react-i18next). Dictionaries: `src/i18n/locales/fr.ts` (source) + `en.ts` (mirror); **keys are typed** (`i18n/i18next.d.ts`) so an unknown key is a compile error — **add new keys to both files**. `relativeTime` (`lib/time.ts`) uses `Intl.RelativeTimeFormat`. Language = browser detection + switcher in Settings (localStorage `pp_lang`). Storybook initializes i18n in `preview.ts`; story/mock content is plain English (dev-only).

### Local device state (not server-backed)

Some concerns are device-local and bypass the API/`SpaceApp` layer: **theme** (`src/theme.ts`, localStorage `pp_theme`, applied at boot in `main.tsx`), **language** (`pp_lang`), and an optional **passcode lock** (`src/lib/pin.ts` = salted SHA-256 in localStorage `pp_pin`, a soft device deterrent — not real crypto; `src/app/LockGate.tsx` wraps the app and locks on reopen / when backgrounded). They're wired in `SettingsScreen`/`app/` directly, same exception as the orchestration layer.

Notifications (migration `0003`): per-user mode `push`/`digest`/`ghost` (`user_settings`). `notifications::notify_members` sends **Web Push** (crate `web-push`, hyper-client, best-effort spawned task) on new post/challenge/comment to other space members in `push` mode, using `push_subscriptions`; VAPID keys via `VAPID_*` env (empty ⇒ disabled). Frontend: `injectManifest` SW (`src/sw.js`, handles `push`/`notificationclick`), `src/push.ts` (permission + subscribe), `SettingsScreen` (mode picker + logout, reached via the dashboard gear). **Email digest delivery is not implemented yet** (mode is storable; needs SMTP + a scheduled job).

### Domain enums mirror the backend

Each domain enum is **defined once in Rust** (`backend/src/models.rs` consts) and **generated** into `src/domain/types.ts` (the neutral layer, via the `domain_codegen` cargo test — API-13), then re-exported next to its component for convenience (`challenge.ts`, `moods.ts`, `ReactionBar.tsx`, `VerdictPicker.tsx`): `ChallengeStatus`, `Intensity`, `MoodId`, `ReactionId`, `Verdict`. The Rust side is the source of truth — the test fails if `types.ts` drifts. The `api/` layer imports them from `domain/types`, never from `components/`. **Caveat:** moods and reactions also support **free/custom** values, so they travel as `string` (a predefined id OR a free emoji; a free mood is stored as `"emoji label"`) — the union types are the *known* set, validated server-side as "predefined OR bounded emoji/label", not a closed enum.

Mood also has a space-level "mutual surprise" flag (`spaces.blind_mood`): while it's on and I haven't posted my mood today, the API returns other members' mood entries with the **status blanked** (I know they voted, not what) and the dashboard shows a lightly-blurred placeholder; revealed once I post mine. The hot/teasing push only fires once everyone has voted.

The **challenge state machine** is central: `proposed → challengeAccepted | maybeMaybe → jobDone`. `ChallengeCard` renders different actions per state and per `perspective` (`recipient` vs `proposer`).

### Multi-ready data model (backend, in `backend/`)

Content belongs to a `Space` (max 2 users in V1, more later), never directly to a user: `users → space_memberships → spaces`, then moods/posts/challenges/media keyed by `space_id`. Built with Axum + Tokio, JWT auth, Argon2id, `sqlx` (Postgres, **runtime queries** so `cargo build` needs no live DB), `uuid`, `chrono`. `routes::ensure_member` is the per-request authorization guard. Status/mood/intensity values are stored as TEXT matching the frontend strings 1:1 (`challengeAccepted`, `veryHot`, …); `models::challenge_transition_allowed` encodes the state machine. Media is served only through an **authenticated streaming route** (token + space membership) — never from `/public`; files stored under UUIDs in `MEDIA_DIR`, with an optional `viewOnce` ephemeral mode (deleted + marked consumed after one read). Optionally **encrypted at rest** (AES-256-GCM, key `MEDIA_KEY`; column `media.encrypted` lets ciphered + legacy plaintext files coexist) — **never change `MEDIA_KEY` once set**. Posts and challenges carry photos **and videos** (`SafeMedia` renders `<video>` by mime; same press-and-hold gesture); orphan media (uploaded but unattached, >1h) is purged hourly.

Backend commands (run in `backend/`): `cargo build` / `cargo run` (applies migrations on start); `cargo test` (unit tests for pure logic — state machine, validation, Range parsing, media crypto — no DB needed); `docker-compose up -d` for Postgres. `cargo build` + `cargo test` are the gates.

### Deployment

The **web image** (`frontend/Dockerfile`, with `frontend/nginx.conf`) is nginx serving the PWA **and** reverse-proxying `/api` (incl. the WebSocket upgrade) → the api service, so production is same-origin (no CORS; built with `VITE_API_URL=""` → relative `/api`). `deploy/docker-compose.yml` runs db + api + web; only `web` is exposed — put a reverse proxy in front for domain + TLS. Public images are published to Docker Hub (`pinkphone/pinkphone-{api,web}`) by the manual GitHub release workflow (`.github/workflows/release.yml`); the API applies migrations on startup. Keep `JWT_SECRET` stable (changing it invalidates all sessions) and set all four `OIDC_*` for SSO (`oidc_enabled()` needs them non-empty). A **startup guard** refuses to boot if the API binds a non-loopback address with the dev `JWT_SECRET` (warns on default DB password / missing `MEDIA_KEY`) — so a publicly-exposed deploy needs a real secret. `deploy/docker-compose.local.yml` is a zero-config local demo (throwaway secrets, no `.env`). Images are multi-arch (`linux/amd64` + `linux/arm64`). Self-hosting guide: `INSTALL.md` (+ `deploy/README.md`).

## Design system — "felted"

Skeuomorphic, soft, warm — **not** flat-and-cold, **not** candy/barbie pink, **not** clinical or explicit. All tokens live in `frontend/tailwind.config.js`; the app is dark-only (charcoal background), so use the palette directly (no `dark:` variants are configured).

- Colors: `blush` (light card fills) → `spice` (primary accent) → `bordeaux` (hot/active states); neutrals `charcoal` (bg) and `taupe` (text).
- Fonts: `font-serif` = Playfair Display (titles), `font-sans` = Inter (body), loaded offline via `@fontsource` in `src/index.css`.
- Shapes/feel: generous rounding (`rounded-2xl`/`3xl`), soft shadows (`shadow-felt`, `shadow-glow`), subtle textures (`bg-felt-velvet`/`bg-felt-linen`), slow transitions (`ease-felt`). Active controls get a soft glow, not a flat color swap.
- Security as sensuality: media is blurred by default and revealed by press-and-hold (`SafeMedia`) — keep that gesture, don't reduce it to a toggle.

Mobile-first: respect safe-area insets; Storybook defaults to a mobile viewport and charcoal background.

PWA install: the manifest (in `frontend/vite.config.ts`) + `injectManifest` SW + icons in `frontend/public/` (`pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png`, regenerated from an SVG via `rsvg-convert`) make it installable. `src/app/InstallPrompt.tsx` shows an in-app banner (`InstallBanner`): native prompt on Android (`beforeinstallprompt`), manual instructions on iOS (no native prompt; relies on `apple-mobile-web-app-*` meta in `index.html`).
