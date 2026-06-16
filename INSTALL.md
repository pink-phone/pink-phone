# Installation auto-hébergée

Pink Phone s'auto-héberge avec **Docker Compose** : Postgres + l'API Rust + un nginx qui sert la PWA **et** reverse-proxie `/api` (tout en same-origin, pas de CORS à gérer).

> Le `deploy/docker-compose.yml` du dépôt tire des images d'un registre privé (CI Forgejo). Pour un déploiement **depuis les sources**, utilise le compose ci-dessous (build local). Une fois la CI Docker Hub en place, on pourra pointer des images publiées.

## 1. Prérequis

- Docker + Docker Compose v2.
- (Recommandé) un reverse-proxy en façade pour le **domaine + TLS** (Traefik, Caddy, nginx…). Indispensable pour la PWA (service worker, push) qui exige HTTPS.

## 2. Récupérer le code

```bash
git clone <repo> pinkphone && cd pinkphone
```

## 3. Configurer l'environnement

Copie l'exemple et renseigne les valeurs :

```bash
cp deploy/.env.example .env
```

| Variable | Rôle | Comment générer |
|---|---|---|
| `JWT_SECRET` | **Requis.** Signe les jetons de session (stable !) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | **Requis.** Mot de passe de la base | `openssl rand -base64 24` |
| `MEDIA_KEY` | Chiffre les médias au repos (AES-256-GCM). Vide = clair. **Ne jamais changer après coup.** | `openssl rand -base64 32` |
| `WEB_PORT` | Port exposé sur l'hôte (cible du reverse-proxy) | déf. `8095` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (notifications). Vides = push désactivé | `npx web-push generate-vapid-keys` |
| `PASSWORD_AUTH_ENABLED` | Auth email/mot de passe (`false` = SSO seul) | déf. `true` |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` / `OIDC_POST_LOGIN_REDIRECT` | SSO/OIDC (tous requis si activé, sinon SSO désactivé) | côté fournisseur (Authentik, Keycloak…) |

Le callback OIDC est sur le domaine public : `https://ton-domaine/api/auth/oidc/callback`.

## 4. Compose (build depuis les sources)

Crée un `docker-compose.yml` (ou adapte `deploy/docker-compose.yml` en remplaçant `image:` par `build:`) :

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: pink
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
      POSTGRES_DB: pinkphone
    volumes: [pink-pgdata:/var/lib/postgresql/data]
    networks: [pink]

  api:
    build: { context: ./backend }
    restart: unless-stopped
    depends_on: [db]
    environment:
      DB_HOST: db
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      JWT_SECRET: ${JWT_SECRET:?}
      BIND_ADDR: 0.0.0.0:8080
      MEDIA_DIR: /data/media
      MEDIA_KEY: ${MEDIA_KEY:-}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-mailto:admin@example.com}
      PASSWORD_AUTH_ENABLED: ${PASSWORD_AUTH_ENABLED:-true}
      OIDC_ISSUER: ${OIDC_ISSUER:-}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:-}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:-}
      OIDC_REDIRECT_URI: ${OIDC_REDIRECT_URI:-}
      OIDC_POST_LOGIN_REDIRECT: ${OIDC_POST_LOGIN_REDIRECT:-}
    volumes: [pink-media:/data/media]
    networks: [pink]

  web:
    build: { context: ., dockerfile: Dockerfile }
    restart: unless-stopped
    depends_on: [api]
    ports: ["${WEB_PORT:-8095}:80"]
    networks: [pink]

networks: { pink: {} }
volumes: { pink-pgdata: {}, pink-media: {} }
```

```bash
docker compose up -d --build
```

- L'API **applique les migrations au démarrage** (aucune étape manuelle).
- L'API refuse de démarrer si elle est exposée avec un `JWT_SECRET` de dev — c'est voulu.

## 5. Reverse-proxy (TLS) — ⚠️ WebSocket

Pointe ton proxy vers `http://<hôte>:${WEB_PORT}`. Le **temps réel** repose sur un WebSocket (`/api/spaces/{id}/ws`) : le proxy de façade **doit transmettre l'upgrade WebSocket** (la plupart le font, Traefik automatiquement ; pour nginx, propager `Upgrade`/`Connection`). Le nginx interne de l'image `web` gère déjà l'upgrade et un `proxy_read_timeout` long (cf. `deploy/web-nginx.conf`).

## 6. Premier lancement

Ouvre l'app via ton domaine HTTPS, crée un compte, crée un **salon**, puis partage son identifiant à ton/ta partenaire pour qu'il/elle rejoigne. Installe la PWA (« Sur l'écran d'accueil »).

## Sauvegardes & sécurité

- Données à sauvegarder : volume **`pink-pgdata`** (base) et **`pink-media`** (fichiers).
- Les médias sont chiffrés au repos **si** `MEDIA_KEY` est défini ; les **métadonnées Postgres restent en clair** → pour une protection complète contre l'accès disque, chiffrer le volume au niveau OS (LUKS).
- Garder `JWT_SECRET` **stable** (le changer déconnecte tout le monde) et `MEDIA_KEY` **immuable** (le changer rend les médias illisibles).
