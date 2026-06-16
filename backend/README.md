# PinkPhone — API (Rust / Axum)

Backend de *Pink Phone*. Axum + Tokio, Postgres via `sqlx` (requêtes
runtime — `cargo build` compile **sans** base lancée), auth JWT + Argon2id.

## Démarrer en local

```bash
cp .env.example .env            # adapter JWT_SECRET en prod
docker-compose up -d            # Postgres sur :5432
cargo run                       # applique les migrations puis sert sur :8080
```

> Ici `docker-compose` (binaire v2 standalone). Avec le plugin : `docker compose`.

`cargo build` seul suffit à vérifier la compilation. Les migrations
(`migrations/`) sont appliquées automatiquement au démarrage.

## Architecture

- `config.rs` — configuration via env (`.env`).
- `error.rs` — `ApiError` → réponse JSON `{ "error": ... }` ; `From<sqlx::Error>`.
- `state.rs` — `AppState { pool, config }` injecté dans les handlers.
- `auth.rs` — Argon2id (hash/verify), JWT (`issue`/`verify`), **extractor `AuthUser`**
  qui lit `Authorization: Bearer <jwt>`.
- `models.rs` — structs `FromRow` + valeurs autorisées. Les statuts/moods/intensités
  sont des **TEXT alignés 1:1 sur les types du frontend** (`challengeAccepted`,
  `veryHot`, …). `challenge_transition_allowed` encode la machine à états.
- `routes/` — un module par ressource. `ensure_member()` est la garde
  d'autorisation : tout contenu d'un `Space` exige l'appartenance.

### Modèle de données (multi-ready)

Le contenu appartient à un `Space`, jamais directement à un user :
`users → space_memberships → spaces`, puis `moods` / `posts` / `challenges` /
`media` rattachés au `space_id`. V1 : 2 membres max par space.

## Endpoints

| Méthode & route | Rôle |
|---|---|
| `POST /api/auth/register` · `login` · `GET /me` | comptes + JWT (register/login → 403 si `PASSWORD_AUTH_ENABLED=false`) |
| `GET /api/auth/config` | méthodes dispo (`passwordEnabled`, `oidcEnabled`) |
| `GET /api/auth/oidc/login` · `…/callback` | SSO OIDC (Authorization Code + PKCE) |
| `POST /api/spaces` · `GET /api/spaces/me` | créer / lister ses espaces |
| `POST /api/spaces/{id}/join` · `GET .../members` | rejoindre / membres |
| `PUT /api/spaces/{id}/mood` · `GET .../moods` | humeur (upsert) / liste (mood « du jour » : seuls les < 24h sont renvoyés) |
| `GET`·`POST /api/spaces/{id}/posts` | blog : lister (enrichi réactions/verdict/nb commentaires) / créer |
| `POST .../posts/{pid}/reactions` · `DELETE .../reactions/{r}` | réaction emoji (toggle) → résumé |
| `PUT`·`DELETE .../posts/{pid}/verdict` | verdict (Chaud·e/Curieux·se/Pas mon truc) |
| `GET`·`POST .../posts/{pid}/comments` | fil de commentaires |
| `GET`·`POST /api/spaces/{id}/challenges` | défis : lister / proposer |
| `PATCH /api/spaces/{id}/challenges/{cid}/status` | transition d'état |
| `POST /api/spaces/{id}/media` | upload multipart (hors `/public`, UUID) |
| `GET /api/spaces/{id}/media/{mid}` | **stream authentifié**, view-once |
| `GET`·`PUT /api/me/settings` | mode de notif (`push`/`digest`/`ghost`) |
| `GET /api/notifications/vapid` | clé publique VAPID (applicationServerKey) |
| `POST`·`DELETE /api/me/push` | (dé)abonnement Web Push de l'appareil |
| `GET /health` | sonde |

### Auth & OIDC

Email/mot de passe (Argon2id) + **OIDC/SSO** (`routes/oidc.rs`), les deux activables
indépendamment : `PASSWORD_AUTH_ENABLED=false` coupe le mot de passe, et l'OIDC
s'active dès que `OIDC_*` est rempli. Flux **Authorization Code + PKCE**, client
confidentiel (le secret reste serveur) ; l'`id_token` est validé (signature via JWKS,
`iss`/`aud`/`exp`/`nonce`) ; le compte est lié par `oidc_sub` puis par email, sinon créé
(migration `0004` : `password_hash` nullable + `oidc_sub`). Au succès, le navigateur est
renvoyé vers `OIDC_POST_LOGIN_REDIRECT` avec le JWT en fragment (`#token=…`). Testé
contre un vrai fournisseur requis (ex: Authentik) ; ici validés : `/auth/config`, la
désactivation du mot de passe (403), la garde OIDC (404), et le redirect d'erreur du callback.

### Notifications

Mode par utilisateur (`user_settings.notif_mode`). Sur nouveau post / défi / commentaire,
`notifications::notify_members` envoie un **Web Push** (best-effort, tâche de fond) aux autres
membres en mode `push`, via leurs `push_subscriptions` ; les abonnements morts (404/410) sont
purgés. VAPID via `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (vides ⇒ push désactivé) —
générer : `npx web-push generate-vapid-keys`. Le **digest e-mail** n'est pas encore implémenté
(mode stockable, envoi à venir : SMTP + tâche planifiée).

## Sécurité des médias

Fichiers stockés sous un nom UUID dans `MEDIA_DIR` (hors de tout dossier public).
Lecture uniquement via la route authentifiée qui vérifie l'appartenance au space.
`viewOnce=true` : le fichier est supprimé et marqué `consumed` après une lecture
(toute lecture ultérieure → 404).
