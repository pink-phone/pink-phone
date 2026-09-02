mod auth;
mod config;
mod error;
mod invite_code;
mod models;
mod notifications;
mod pagination;
mod rate_limit;
mod routes;
mod state;

// Tests d'intégration (routes + SQL) sur une vraie Postgres jetable, gated par la
// feature `integration` (cf. Cargo.toml) → exclus du `cargo test` no-DB.
#[cfg(all(test, feature = "integration"))]
mod tests_integration;

use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method};
use axum::routing::get;
use axum::Router;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::str::FromStr;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,pinkphone_api=debug")),
        )
        .init();

    let config = Config::from_env();

    // Garde anti-config-de-dev : si l'API est exposée (bind non-loopback) avec des
    // secrets par défaut, on refuse de démarrer ; on alerte si les médias sont en clair.
    {
        let exposed = !(config.bind_addr.starts_with("127.")
            || config.bind_addr.starts_with("localhost")
            || config.bind_addr.starts_with("[::1]"));
        // On refuse de démarrer exposé avec la valeur de dev OU un secret à trop
        // faible entropie (SEC-016) : un `JWT_SECRET` court (ex. la valeur du
        // compose de démo locale) contournerait la seule égalité avec la valeur
        // de dev tout en restant trivial à brute-forcer.
        if exposed
            && (config.jwt_secret == "dev-insecure-secret"
                || config.jwt_secret.len() < 32)
        {
            return Err(format!(
                "JWT_SECRET trop faible (valeur de dev ou < 32 caractères) alors que l'API est exposée sur {} — refus de démarrer.",
                config.bind_addr
            )
            .into());
        }
        if exposed && config.db_password == "pink" {
            tracing::warn!(
                "DB_PASSWORD par défaut ('pink') avec une API exposée — à changer."
            );
        }
        // CORS_ORIGIN au défaut dev alors que l'API est exposée (SECURITY_FINDINGS.md #3) :
        // sans effet sur l'app elle-même (servie same-origin derrière nginx en prod), mais
        // ça autorise en pratique tout serveur de dev Vite local (port 5173 par défaut,
        // n'importe quel projet) à faire des requêtes cross-origin vers cette API — signe
        // que `CORS_ORIGIN` n'a pas été positionné pour ce déploiement.
        if exposed && config.cors_origin == "http://localhost:5173" {
            tracing::warn!(
                "CORS_ORIGIN au défaut de dev ('http://localhost:5173') avec une API exposée \
                 — positionne CORS_ORIGIN sur l'origine réelle du déploiement."
            );
        }
        if config.media_key_bytes().is_none() {
            if config.media_key.trim().is_empty() {
                tracing::warn!(
                    "MEDIA_KEY absente : les médias sont stockés EN CLAIR sur disque."
                );
            } else {
                // Clé fournie mais illisible : les nouveaux médias passeront en clair ET
                // tout média déjà chiffré deviendra impossible à déchiffrer (→ 500
                // « média indisponible »). Cause probable d'un bug média intermittent.
                tracing::error!(
                    "MEDIA_KEY fournie mais INVALIDE (base64 32 octets attendu) : \
                     médias chiffrés existants illisibles, nouveaux stockés EN CLAIR."
                );
            }
        }
    }

    // DSN explicite si fourni (dev), sinon construit depuis les champs db_* :
    // évite tout problème d'encodage d'URL quand le mot de passe contient des
    // caractères spéciaux (/, +, @, …).
    let connect_options = if config.database_url.is_empty() {
        PgConnectOptions::new()
            .host(&config.db_host)
            .port(config.db_port)
            .username(&config.db_user)
            .password(&config.db_password)
            .database(&config.db_name)
    } else {
        PgConnectOptions::from_str(&config.database_url)?
    };
    let pool = PgPoolOptions::new()
        .max_connections(10)
        // Échoue vite (10 s) plutôt que de laisser une requête pendre si le pool
        // est saturé — évite un empilement silencieux sous charge (SEC-018).
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect_with(connect_options)
        .await?;

    // Applique les migrations au démarrage.
    sqlx::migrate!("./migrations").run(&pool).await?;

    // Sous-commande de maintenance ponctuelle : chiffre les médias déjà en clair,
    // puis quitte (ne démarre pas le serveur). Lancer avec MEDIA_KEY défini :
    //   docker compose run --rm api pinkphone-api backfill-media-encryption
    if std::env::args().nth(1).as_deref() == Some("backfill-media-encryption") {
        let key = config
            .media_key_bytes()
            .ok_or("MEDIA_KEY absente/invalide : impossible de chiffrer les médias")?;
        routes::media::backfill_encryption(&pool, &config.media_dir, &key).await?;
        return Ok(());
    }

    // Rotation de clé : déchiffre avec MEDIA_KEY (ancienne), rechiffre avec
    // MEDIA_KEY_NEW (nouvelle). Puis met à jour le secret MEDIA_KEY = la nouvelle.
    //   docker exec -e MEDIA_KEY_NEW="<nouvelle b64>" <api> pinkphone-api rotate-media-key
    if std::env::args().nth(1).as_deref() == Some("rotate-media-key") {
        let old_key = config
            .media_key_bytes()
            .ok_or("MEDIA_KEY (ancienne clé) absente/invalide")?;
        let new_raw = std::env::var("MEDIA_KEY_NEW")
            .map_err(|_| "MEDIA_KEY_NEW non défini (la nouvelle clé, base64 32 octets)")?;
        let new_key = config::decode_media_key(&new_raw)
            .ok_or("MEDIA_KEY_NEW invalide (base64 de 32 octets attendu)")?;
        if old_key == new_key {
            return Err("MEDIA_KEY_NEW identique à MEDIA_KEY : rien à faire".into());
        }
        routes::media::rotate_key(&pool, &config.media_dir, &old_key, &new_key).await?;
        return Ok(());
    }

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let oidc_states = std::sync::Arc::new(std::sync::Mutex::new(
        std::collections::HashMap::new(),
    ));
    let oidc_tickets = std::sync::Arc::new(std::sync::Mutex::new(
        std::collections::HashMap::new(),
    ));
    let oidc_cache = std::sync::Arc::new(std::sync::Mutex::new(None));
    // Bus d'événements temps réel (WebSockets). Le receiver initial est jeté ;
    // chaque connexion s'abonne via `events.subscribe()`.
    let (events, _) = tokio::sync::broadcast::channel(256);

    // `CORS_ORIGIN` vide (déploiement same-origin recommandé, cf. INSTALL.md/deploy/) :
    // on n'appelle PAS `.allow_origin` du tout plutôt que de retomber sur un défaut —
    // sans lui, `CorsLayer` ne pose jamais d'`Access-Control-Allow-Origin`, donc tout
    // appel cross-origin échoue côté navigateur (SECURITY_FINDINGS.md #3). Les requêtes
    // same-origin (le cas réel en prod, via nginx) ne sont de toute façon jamais
    // soumises au contrôle CORS du navigateur.
    let mut cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);
    if !config.cors_origin.is_empty() {
        cors = cors.allow_origin(config.cors_origin.parse::<HeaderValue>()?);
    }

    let bind_addr = config.bind_addr.clone();
    let state = AppState {
        pool,
        config: std::sync::Arc::new(config),
        http,
        push_client: std::sync::Arc::new(web_push::HyperWebPushClient::new()),
        oidc_states,
        oidc_tickets,
        oidc_cache,
        events,
        rate_limiter: std::sync::Arc::new(rate_limit::RateLimiter::new()),
    };

    // Purges périodiques (toutes les heures ; 1er passage immédiat) : médias
    // orphelins + invitations consommées/expirées (SEC-NEW-004).
    {
        let state = state.clone();
        let media_dir = state.config.media_dir.clone();
        tokio::spawn(async move {
            let mut tick =
                tokio::time::interval(std::time::Duration::from_secs(3600));
            loop {
                tick.tick().await;
                crate::routes::media::purge_orphan_media(&state.pool, &media_dir).await;
                crate::routes::spaces::purge_stale_invites(&state.pool).await;
                // Livre les mots doux différés arrivés à échéance (#102).
                crate::routes::love_notes::deliver_due_notes(&state).await;
            }
        });
    }

    let app: Router = routes::api_router()
        .route("/health", get(|| async { "ok" }))
        .with_state(state)
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100 Mo (médias : photos + vidéos)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("PinkPhone API à l'écoute sur http://{bind_addr}");
    // `with_connect_info` : nécessaire pour que l'extracteur `ClientIp` (rate
    // limiting, SECURITY_FINDINGS.md #1-2) retombe sur l'IP de connexion TCP
    // directe quand l'en-tête `X-Real-IP` du reverse-proxy est absent (dev sans
    // proxy notamment).
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;

    Ok(())
}
