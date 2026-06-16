# Contribuer à Pink Phone

Merci de l'intérêt 💛 Ce guide couvre l'essentiel pour développer sereinement.

## 🌟 La règle d'or : Storybook-first

**Tout composant React doit exister dans Storybook (`*.stories.tsx`) avant d'être utilisé dans l'app.** On construit la brique isolée — ses états/variants sous le design system « felted » — on la valide en Storybook, **puis** on la compose dans les écrans. On ne câble pas un composant dans une page s'il n'a pas de story.

Exception : la couche d'orchestration (`src/app/`, `src/api/`, `src/auth/`) qui parle au réseau et porte l'état — elle n'est pas dans Storybook (même catégorie que `App.tsx`).

## 🧰 Prérequis

- **Node ≥ 20.19** (Storybook 10 l'exige ; sur macOS, le node Homebrew suffit).
- **Rust** stable + **Cargo** (backend).
- **Docker** (Postgres en local).

## 💻 Travailler

### Front
```bash
npm install
npm run storybook        # surface de design — :6006 (le terrain de jeu principal)
npm run dev              # l'app (Vite) — :5173
```

### Back
```bash
cd backend
cp .env.example .env
docker compose up -d     # Postgres :5432
cargo run                # API :8080 (migrations appliquées au démarrage)
```

## ✅ Avant de pousser — les portes de compilation

Il n'y a **ni test runner ni linter** configurés. La validation passe par le compilateur (TypeScript strict, `noUnusedLocals`/`noUnusedParameters`) et par les builds. Tout doit sortir en **exit 0** :

```bash
npx tsc --noEmit          # type-check front
npm run build             # build PWA (tsc + vite)
npm run build-storybook   # « est-ce que tout compile ? » de fait
cd backend && cargo build # compile l'API (sqlx runtime → pas besoin de DB)
```

Si tu ajoutes une **migration** SQL, vérifie qu'elle s'applique (Postgres jetable ou `cargo run`). Ne **jamais** modifier une migration déjà appliquée (sqlx vérifie le checksum) — en ajouter une nouvelle.

## 🧭 Architecture (rappel)

- `src/components/<Name>/` — réutilisables, **présentationnels**, contrôlés (props + callbacks). Une `*.stories.tsx` chacun.
- `src/screens/<Name>/` — écrans présentationnels (données + handlers en props), avec stories.
- `src/app/` — orchestration : `Root` → `SpaceGate` → `SpaceApp` (état, réseau, WebSocket).
- `src/api/` (client typé), `src/auth/`, `src/i18n/`, `src/theme.ts`.
- `backend/src/routes/` — un module par ressource ; `ensure_member()` est la garde d'autorisation par salon.

Les **enums de domaine** (`MoodId`, `ChallengeStatus`, `Intensity`, `ReactionId`, `Verdict`) sont des contrats partagés avec le backend : les chaînes sont alignées 1:1 (ex. `challengeAccepted`, `veryHot`).

## 🌍 i18n

Toute chaîne visible passe par `t(...)`. Les dictionnaires sont dans `src/i18n/locales/` (FR = source, EN = miroir). Les clés sont **typées** : une clé inconnue est une erreur de compilation. Ajoute la clé dans `fr.ts` **et** `en.ts`.

## 🎨 Design system « felted »

Dark-only, mobile-first. Couleurs en variables CSS (`src/index.css`) + tokens Tailwind (`tailwind.config.js`). Arrondis généreux, ombres douces (`shadow-felt`), transitions lentes (`ease-felt`). Respecter `prefers-reduced-motion`. La sécurité est *sensuelle* : média flouté révélé au press-and-hold (`SafeMedia`) — ne pas réduire ce geste à un toggle.

## 🔀 Git & commits

- Branche depuis `main` ; pas de commit direct sur `main` sauf accord.
- Messages clairs ; conventions type *Conventional Commits* (`feat:`, `fix:`, `chore:`…) bienvenues.
- Décris le **pourquoi** autant que le **quoi**.
