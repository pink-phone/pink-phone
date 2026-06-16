# Pink Phone

PWA intime pour couples : blog « à tête reposée », **mood** (météo sexuelle) et **défis**.
Front React + Tailwind (PWA) + backend Rust/Axum (`backend/`).

## Règle d'or
**Tout composant React doit exister dans Storybook avant d'être utilisé** dans l'app.
On valide la brique isolée (états/variants, DA « felted ») puis on l'assemble.
Exception : la couche d'orchestration (`src/app`, `src/api`, `src/auth`) qui parle au réseau.

## Scripts
```bash
npm install
npm run storybook   # design system (port 6006)
npm run dev         # app (Vite, port 5173)
npm run build       # build prod (tsc + vite)
```

## Lancer en mode connecté (front + API)
```bash
# 1) le backend (voir backend/README.md)
cd backend && docker-compose up -d && cargo run   # API sur :8080
# 2) le front (autre terminal)
npm run dev                                        # :5173 (CORS autorisé par l'API)
```
URL de l'API configurable via `VITE_API_URL` (défaut `http://localhost:8080`).

## Installable (PWA mobile)
Manifeste + service worker + icônes (`public/pwa-*.png`, `apple-touch-icon.png`,
maskable) → installable sur l'écran d'accueil. Android/Chromium : prompt natif via
`InstallPrompt` (`beforeinstallprompt`). iOS Safari : bannière d'instructions
(Partager → « Sur l'écran d'accueil ») + métas `apple-mobile-web-app-*`.
Régénérer les icônes : `rsvg-convert` sur une source SVG (cœur feutré).

## Déploiement (CI/CD)
Pipeline Forgejo Actions (modèle `a reverse proxy`) : push branche → images `:<sha>` ;
merge sur `main` → bump semver + `:latest`/`:<version>` + tag git ; tag `v*` →
déploiement SSH sur le server (derrière a reverse proxy). Détails et configuration Forgejo :
[`deploy/README.md`](deploy/README.md).

## Direction artistique — « felted »
Skeuomorphisme feutré : roses désaturés (Blush Privé → Rose Épicé → Vin Bordelais),
neutres chauds (Charbon Doux, Taupe), titres serif (Playfair) / corps sans (Inter),
coins arrondis, ombres douces, transitions lentes. Tokens dans `tailwind.config.js`.

## Composants (Storybook)
Fondations
- `Fondations/Surface` — carte feutrée de base (velvet / blush / deep)
- `Fondations/Button` — primary / secondary / ghost
- `Fondations/Badge` — pastilles intensité & statut
- `Fondations/Sheet` — feuille modale bas d'écran (fade + slide-up)
- `Fondations/Form controls` — TextField / TextArea / Toggle / IntensityPicker

Sécurité
- `Sécurité/SafeMedia` — média flouté, révélé en maintenant appuyé, option éphémère

Mood
- `Mood/MoodSelector` — sélecteur d'humeur avec soft glow

Blog
- `Blog/ReactionBar` — réactions emoji rapides (🔥😏😮‍💨🤫)
- `Blog/VerdictPicker` — Chaud·e / Curieux·se / Pas mon truc
- `Blog/BlogPost` — carte de post (récit + média + réactions + verdict + commentaires)
- `Blog/PostComposer` — formulaire de rédaction (titre / récit / média / view-once)

Défis
- `Défis/ChallengeCard` — défi + machine à états (Proposé → Accepted / Maybe → Job done)
- `Défis/ChallengeComposer` — proposition d'un défi (banque de presets + sur-mesure)

Écrans (assemblés à partir des briques ci-dessus)
- `Écrans/AuthScreen` — connexion / création de compte
- `Écrans/OnboardingScreen` — créer ou rejoindre un espace
- `Écrans/Splash` — écran d'attente
- `Écrans/BottomNav` — navigation par onglets (Accueil / Blog / Défis)
- `Écrans/DashboardScreen` — accueil du Space : moods des deux + sélecteur du sien
- `Écrans/BlogScreen` — le fil du journal (liste de posts + bouton écrire)
- `Écrans/ChallengesScreen` — défis groupés par état

`App.tsx` → `AuthProvider` → `Root` (auth) → `SpaceGate` (espaces) → `SpaceApp`
(charge mood/posts/défis du Space via `src/api` et câble les écrans sur l'API).
`src/mock/data.ts` ne sert plus qu'aux stories.
