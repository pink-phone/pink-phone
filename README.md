# Pink Phone 🔥

**Le jardin secret d'un couple.** Une PWA intime — pas une app de rencontre, pas un réseau social — pour deux. Un journal « à tête reposée », une météo de l'envie, et des défis complices. Distribuée en PWA, volontairement **hors des stores**, auto-hébergeable.

> Conçue mobile-first, dark, dans une direction artistique « feutrée » (skeuomorphisme doux, rose désaturé, velours) — ni flat-and-cold, ni rose bonbon, ni clinique.

## ✨ Fonctionnalités

- **Blog** — un journal partagé : récits, photos, réactions emoji (dont une **réaction libre**), commentaires. **Brouillons** (texte + photo, éditables), édition des posts publiés.
- **Mood** — la « météo sexuelle » du jour : une humeur partagée d'un geste, renouvelée à minuit (fuseau du salon). Une humeur chaude/taquine fait *signe* (notification).
- **Défis** — petite machine à états (`proposé → accepté / à adapter → mission accomplie`), avec une **banque de propositions** curée (FR/EN) + propositions propres au salon (CRUD).
- **Médias sensuels & sûrs** — floutés par défaut, révélés au *press-and-hold* ; mode **éphémère** (« vision unique »). **Chiffrables au repos** (AES-256-GCM) et servis uniquement via une route authentifiée.
- **Temps réel** — WebSocket : nouveaux contenus, humeurs, réactions et **accusés de lecture** (« ✓✓ Vu ») se synchronisent en direct. Badges « nouveautés » sur l'accueil.
- **Thèmes** — « Feutré » (défaut) et « Red Velvet », via variables CSS.
- **Bilingue** — FR / EN (react-i18next, détection navigateur, sélecteur dans les réglages).
- **PWA installable** — manifeste + service worker, install Android (prompt natif) / iOS (instructions), recharge auto à la mise à jour, retour matériel Android & swipe iOS.
- **Auth** — email/mot de passe (Argon2id) **et/ou** OIDC/SSO.

## 🖼️ Captures

> _À ajouter dans `docs/screenshots/` puis référencer ici (Dashboard, Blog, Défis, Réglages…)._

| Accueil | Journal | Défis |
|---|---|---|
| _(dashboard.png)_ | _(blog.png)_ | _(challenges.png)_ |

## 🧱 Stack

- **Front** — React 18 + TypeScript + Tailwind v3 + `vite-plugin-pwa`. **Storybook** comme surface de design (chaque composant y existe avant d'être utilisé).
- **Back** — Rust / **Axum** + Tokio, Postgres via `sqlx` (requêtes runtime), JWT + Argon2id, Web Push (VAPID), WebSocket.
- **Déploiement** — images Docker (web nginx + api), CI/CD Forgejo Actions, derrière un reverse-proxy (TLS).

## 🚀 Démarrage rapide (dev)

```bash
# Front (design system + app)
npm install
npm run storybook        # design system — http://localhost:6006
npm run dev              # app (Vite) — http://localhost:5173

# Back (autre terminal) — voir backend/README.md
cd backend
cp .env.example .env     # adapter au besoin
docker compose up -d     # Postgres :5432
cargo run                # API :8080 (applique les migrations au démarrage)
```

L'URL de l'API côté front est configurable via `VITE_API_URL` (défaut `http://localhost:8080`).

## 📦 Auto-hébergement

Installation auto-hébergée (Docker Compose, variables d'env, reverse-proxy + WebSocket, génération des clés) : **[`INSTALL.md`](INSTALL.md)**.

## 🤝 Contribuer

Prérequis, commandes, conventions et la **règle d'or Storybook-first** : **[`CONTRIBUTING.md`](CONTRIBUTING.md)**.

## 🔧 Déploiement (CI/CD)

Pipeline Forgejo Actions (build → release semver → déploiement SSH) : **[`deploy/README.md`](deploy/README.md)**.

## 🎨 Direction artistique — « felted »

Skeuomorphisme feutré : roses désaturés (Blush Privé → Rose Épicé → Vin Bordelais), neutres chauds (Charbon Doux, Taupe), titres serif (Playfair) / corps sans (Inter), coins arrondis, ombres douces, transitions lentes. Palette en **variables CSS** (thématisable) dans `src/index.css` ; tokens dans `tailwind.config.js`.

## 📁 Architecture (survol)

- `src/components/` — briques présentationnelles, contrôlées (chacune a sa `*.stories.tsx`).
- `src/screens/` — écrans (présentationnels) ; `src/app/` — orchestration (état + réseau, WebSocket).
- `src/api/`, `src/auth/`, `src/i18n/`, `src/theme.ts` — client typé, auth, traductions, thèmes.
- `backend/` — API Rust/Axum (voir [`backend/README.md`](backend/README.md)).

`App.tsx` → `AuthProvider` → `Root` (auth) → `SpaceGate` (espaces) → `SpaceApp` (charge mood/posts/défis du Space, WebSocket, câble les écrans). `src/mock/data.ts` ne sert qu'aux stories.

## 📝 Licence

> _Aucune licence définie pour l'instant — à ajouter (`LICENSE`) avant une publication ouverte._
