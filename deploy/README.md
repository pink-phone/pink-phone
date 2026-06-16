# Déploiement — PinkPhone

CI/CD Forgejo Actions, sur le même modèle que `a reverse proxy`. L'app est déployée sur
un server Docker, **derrière a reverse proxy** (qui gère domaine + TLS).

## Le pipeline

| Workflow | Déclencheur | Rôle |
|---|---|---|
| `ci.yml` | push sur une branche ≠ `main` | build + push des 2 images taguées `:<sha>` (compile front + API = validation) |
| `release.yml` | push sur `main` | bump semver (patch), push `:latest` + `:<version>` des 2 images, crée et pousse le tag git `vX.Y.Z` |
| `deploy.yml` | push d'un tag `v*.*.*` | SSH ; génère le `.env` (secrets/vars) + `scp` du compose et du `.env` ; `docker compose pull` + `up -d` (image pinnée à la version) |

Images publiées :
`pinkphone/pinkphone-api` et `…/pinkphone-web`.

## Services déployés (`deploy/docker-compose.yml`)

- **db** — Postgres 16, données sur volume `pink-pgdata`.
- **api** — l'API Rust ; applique les migrations au démarrage ; médias sur volume `pink-media`. Non exposée sur l'hôte.
- **web** — nginx : sert la PWA **et** reverse-proxie `/api` → `api:8080` (same-origin, pas de CORS). Seul service exposé : `${WEB_PORT:-8082}:80`.

a reverse proxy doit pointer le domaine de l'app vers `http://<ip-server>:<WEB_PORT>`.

## Configuration Forgejo (Settings du dépôt)

### Secrets (déploiement + valeurs sensibles du `.env`)
- `FORGEJO_TOKEN` — token avec accès registre (read/write packages) + push du tag.
- `SSH_KEY_<SERVEUR>` — clé privée SSH de déploiement (ex: `SSH_KEY_LXC`).
- `JWT_SECRET` — secret de signature des JWT (long & aléatoire). **Requis.**
- `POSTGRES_PASSWORD` — mot de passe de la base. **Requis.**
- `VAPID_PRIVATE_KEY` — clé privée Web Push (si push).
- `OIDC_CLIENT_SECRET` — secret client OIDC (si SSO).

### Variables (cible + valeurs non sensibles du `.env`)
Cible de déploiement :
- `DEPLOY_SERVER` — nom logique du serveur (ex: `server`) ; sert d'indirection.
- `DEPLOY_HOST_<SERVEUR>` · `DEPLOY_USER_<SERVEUR>` · `DEPLOY_BASE_PATH_<SERVEUR>` (ex: `/opt/stacks`).
- `DEPLOY_FOLDER` — sous-dossier du projet (ex: `pinkphone`).

Configuration applicative (toutes optionnelles, défauts dans le workflow) :
- `WEB_PORT` (déf. 8082) · `PASSWORD_AUTH_ENABLED` (déf. true)
- `VAPID_PUBLIC_KEY` · `VAPID_SUBJECT`
- `OIDC_ISSUER` · `OIDC_CLIENT_ID` · `OIDC_REDIRECT_URI` · `OIDC_POST_LOGIN_REDIRECT`

## Le `.env` est généré par la CI

Plus de fichier à créer à la main : le `deploy.yml` **génère le `.env` à partir des
secrets/variables ci-dessus et le pousse** (`scp`, `chmod 600`) dans
`${DEPLOY_BASE_PATH}/${DEPLOY_FOLDER}/.env` à chaque déploiement (il est donc
**réécrit** à chaque release — la source de vérité est Forgejo, pas le serveur).
`deploy/.env.example` ne sert plus que de référence/déploiement manuel.

Pré-requis serveur : la clé publique SSH dans `authorized_keys` du compte de déploiement,
et un docker pouvant `docker login` le registre. Ensuite, chaque merge sur `main` release
une version qui se déploie seule. Déploiement manuel possible : créer un `.env` puis
`IMAGE_TAG=<version> docker compose up -d`.
