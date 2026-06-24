//! Tests d'intégration : routes HTTP + SQL réels sur une base Postgres jetable
//! (`#[sqlx::test]` crée une base éphémère par test, applique `migrations/`, roule
//! le test dans une transaction annulée). Gated par la feature `integration` →
//! exclus du `cargo test` no-DB (build d'image). Premier lot : notices (#84/#85).
//!
//! Lancer : `docker-compose up -d` puis
//!   `DATABASE_URL=postgres://pink:pink@localhost:5432/pinkphone cargo test --features integration`

use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt; // `oneshot`
use uuid::Uuid;

use crate::auth::issue_token;
use crate::config::Config;
use crate::state::AppState;

// --- Harnais ---------------------------------------------------------------

fn test_config() -> Config {
    Config {
        database_url: String::new(),
        db_host: String::new(),
        db_port: 5432,
        db_user: String::new(),
        db_password: String::new(),
        db_name: String::new(),
        // ≥ 32 chars (la garde de démarrage l'exige ailleurs ; ici on signe juste).
        jwt_secret: "integration-test-secret-0123456789abcdef".into(),
        media_dir: "/tmp".into(),
        media_key: String::new(),
        bind_addr: "127.0.0.1:0".into(),
        cors_origin: "*".into(),
        vapid_public_key: String::new(),
        vapid_private_key: String::new(),
        vapid_subject: String::new(),
        password_auth_enabled: true,
        oidc_issuer: String::new(),
        oidc_client_id: String::new(),
        oidc_client_secret: String::new(),
        oidc_redirect_uri: String::new(),
        oidc_post_login_redirect: String::new(),
    }
}

fn build_app(pool: PgPool) -> (Router, AppState) {
    let (events, _) = tokio::sync::broadcast::channel(256);
    let state = AppState {
        pool,
        config: Arc::new(test_config()),
        http: reqwest::Client::new(),
        push_client: Arc::new(web_push::HyperWebPushClient::new()),
        oidc_states: Arc::new(Mutex::new(Default::default())),
        oidc_tickets: Arc::new(Mutex::new(Default::default())),
        oidc_cache: Arc::new(Mutex::new(None)),
        events,
    };
    let app = crate::routes::api_router().with_state(state.clone());
    (app, state)
}

async fn seed_user(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, 'x') RETURNING id",
    )
    .bind(format!("{name}@test.local"))
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn seed_space(pool: &PgPool, owner: Uuid) -> Uuid {
    let id: Uuid =
        sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('Salon') RETURNING id")
            .fetch_one(pool)
            .await
            .unwrap();
    add_member(pool, owner, id).await;
    id
}

async fn add_member(pool: &PgPool, user: Uuid, space: Uuid) {
    sqlx::query("INSERT INTO space_memberships (user_id, space_id) VALUES ($1, $2)")
        .bind(user)
        .bind(space)
        .execute(pool)
        .await
        .unwrap();
}

fn token_for(state: &AppState, user: Uuid) -> String {
    issue_token(&state.config.jwt_secret, user).unwrap()
}

/// Envoie une requête authentifiée et renvoie (statut, corps JSON).
async fn req(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    let body = match body {
        Some(j) => {
            builder = builder.header(header::CONTENT_TYPE, "application/json");
            Body::from(j.to_string())
        }
        None => Body::empty(),
    };
    let resp = app
        .clone()
        .oneshot(builder.body(body).unwrap())
        .await
        .unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

// --- Tests : notices (#84/#85) --------------------------------------------

#[sqlx::test]
async fn join_emet_une_notice_member_joined(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await; // alice = membre/propriétaire
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    // Alice crée une invitation.
    let (st, inv) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/invites"),
        &ta,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    let token = inv["token"].as_str().unwrap().to_string();

    // Bob rejoint avec le token.
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({ "token": token })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);

    // Alice voit la notice « member_joined » (acteur = bob).
    let (st, na) =
        req(&app, "GET", &format!("/api/spaces/{space}/notices"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    let arr = na.as_array().unwrap();
    assert_eq!(arr.len(), 1, "alice devrait voir 1 notice");
    assert_eq!(arr[0]["kind"], "member_joined");
    assert_eq!(arr[0]["actorName"], "bob");

    // Bob ne voit PAS sa propre action (exclusion `actor_id <> moi`).
    let (_, nb) =
        req(&app, "GET", &format!("/api/spaces/{space}/notices"), &tb, None).await;
    assert_eq!(nb.as_array().unwrap().len(), 0, "bob ne se notifie pas lui-même");
}

#[sqlx::test]
async fn activation_download_emet_une_notice_une_seule_fois(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    // Alice active le téléchargement (false → true).
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}"),
        &ta,
        Some(json!({ "allowMediaDownload": true })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Bob voit « download_enabled ».
    let (_, nb) =
        req(&app, "GET", &format!("/api/spaces/{space}/notices"), &tb, None).await;
    let arr = nb.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["kind"], "download_enabled");

    // Re-PATCH à true (pas de transition) → pas de nouvelle notice.
    let _ = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}"),
        &ta,
        Some(json!({ "allowMediaDownload": true })),
    )
    .await;
    let (_, nb2) =
        req(&app, "GET", &format!("/api/spaces/{space}/notices"), &tb, None).await;
    assert_eq!(
        nb2.as_array().unwrap().len(),
        1,
        "pas de doublon sans transition false→true",
    );
}

#[sqlx::test]
async fn notices_refuse_un_non_membre(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let intrus = seed_user(&pool, "intrus").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, intrus);

    let (st, _) =
        req(&app, "GET", &format!("/api/spaces/{space}/notices"), &t, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "ensure_member doit bloquer");
}
