mod auth;
mod config;
mod error;
mod models;
mod notifications;
mod routes;
mod state;

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
        if exposed && config.jwt_secret == "dev-insecure-secret" {
            return Err(format!(
                "JWT_SECRET non configuré (valeur de dev) alors que l'API est exposée sur {} — refus de démarrer.",
                config.bind_addr
            )
            .into());
        }
        if exposed && config.db_password == "pink" {
            tracing::warn!(
                "DB_PASSWORD par défaut ('pink') avec une API exposée — à changer."
            );
        }
        if config.media_key_bytes().is_none() {
            tracing::warn!(
                "MEDIA_KEY absente/invalide : les médias sont stockés EN CLAIR sur disque."
            );
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
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    // Applique les migrations au démarrage.
    sqlx::migrate!("./migrations").run(&pool).await?;

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let oidc_states = std::sync::Arc::new(std::sync::Mutex::new(
        std::collections::HashMap::new(),
    ));
    // Bus d'événements temps réel (WebSockets). Le receiver initial est jeté ;
    // chaque connexion s'abonne via `events.subscribe()`.
    let (events, _) = tokio::sync::broadcast::channel(256);

    let cors = CorsLayer::new()
        .allow_origin(config.cors_origin.parse::<HeaderValue>()?)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    let bind_addr = config.bind_addr.clone();
    let state = AppState {
        pool,
        config,
        http,
        oidc_states,
        events,
    };

    // Purge périodique des médias orphelins (toutes les heures ; 1er passage immédiat).
    {
        let pool = state.pool.clone();
        let media_dir = state.config.media_dir.clone();
        tokio::spawn(async move {
            let mut tick =
                tokio::time::interval(std::time::Duration::from_secs(3600));
            loop {
                tick.tick().await;
                crate::routes::media::purge_orphan_media(&pool, &media_dir).await;
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
    axum::serve(listener, app).await?;

    Ok(())
}
