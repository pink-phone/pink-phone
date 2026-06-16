# Contributing to Pink Phone

Thanks for your interest 💛 This guide covers the essentials to work comfortably.

## 🌟 The golden rule: Storybook-first

**Every React component must exist in Storybook (`*.stories.tsx`) before it is used in the app.** Build the isolated brick — its states/variants under the "felted" design system — validate it in Storybook, **then** compose it into screens. Don't wire a component into a page if it has no story.

Exception: the orchestration layer (`src/app/`, `src/api/`, `src/auth/`) that talks to the network and holds state — it is not in Storybook (same category as `App.tsx`).

## 🧰 Prerequisites

- **Node ≥ 20.19** (Storybook 10 requires it; on macOS, the Homebrew node works).
- **Rust** stable + **Cargo** (backend).
- **Docker** (local Postgres).

## 💻 Working

### Front
```bash
npm install
npm run storybook        # design surface — :6006 (the primary playground)
npm run dev              # the app (Vite) — :5173
```

### Back
```bash
cd backend
cp .env.example .env
docker compose up -d     # Postgres :5432
cargo run                # API :8080 (migrations applied on startup)
```

## ✅ Before pushing — the compile gates

There is **no test runner and no linter** configured. Validation goes through the compiler (strict TypeScript, `noUnusedLocals`/`noUnusedParameters`) and the builds. Everything must exit **0**:

```bash
npx tsc --noEmit          # front type-check
npm run build             # PWA build (tsc + vite)
npm run build-storybook   # de-facto "does everything compile?"
cd backend && cargo build # compiles the API (sqlx runtime → no DB needed)
```

If you add a SQL **migration**, verify it applies (throwaway Postgres or `cargo run`). **Never** edit an already-applied migration (sqlx checks the checksum) — add a new one.

## 🧭 Architecture (recap)

- `src/components/<Name>/` — reusable, **presentational**, controlled (props + callbacks). One `*.stories.tsx` each.
- `src/screens/<Name>/` — presentational screens (data + handlers via props), with stories.
- `src/app/` — orchestration: `Root` → `SpaceGate` → `SpaceApp` (state, network, WebSocket).
- `src/api/` (typed client), `src/auth/`, `src/i18n/`, `src/theme.ts`.
- `backend/src/routes/` — one module per resource; `ensure_member()` is the per-space authorization guard.

The **domain enums** (`MoodId`, `ChallengeStatus`, `Intensity`, `ReactionId`, `Verdict`) are a shared contract with the backend: strings are aligned 1:1 (e.g. `challengeAccepted`, `veryHot`).

## 🌍 i18n

Every user-facing string goes through `t(...)`. Dictionaries live in `src/i18n/locales/` (FR = source, EN = mirror). Keys are **typed**: an unknown key is a compile error. Add the key to both `fr.ts` **and** `en.ts`.

## 🎨 "Felted" design system

Dark-only, mobile-first. Colors as CSS variables (`src/index.css`) + Tailwind tokens (`tailwind.config.js`). Generous rounding, soft shadows (`shadow-felt`), slow transitions (`ease-felt`). Respect `prefers-reduced-motion`. Security is *sensual*: media blurred and revealed by press-and-hold (`SafeMedia`) — don't reduce that gesture to a toggle.

## 🔀 Git & commits

- Branch off `main`; no direct commits to `main` without agreement.
- Clear messages; *Conventional Commits* style (`feat:`, `fix:`, `chore:`…) welcome.
- Describe the **why** as much as the **what**.
