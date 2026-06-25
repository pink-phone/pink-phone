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

/// Insère un média « brut » dans l'espace (sans passer par l'upload multipart).
async fn seed_media(pool: &PgPool, space: Uuid, owner: Uuid, mime: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO media (space_id, owner_id, storage_key, mime)
         VALUES ($1, $2, gen_random_uuid()::text, $3) RETURNING id",
    )
    .bind(space)
    .bind(owner)
    .bind(mime)
    .fetch_one(pool)
    .await
    .unwrap()
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
    let code = inv["code"].as_str().unwrap().to_string();

    // Bob rejoint avec le code.
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({ "code": code })),
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
async fn invite_code_lisible_et_join_insensible_a_la_casse(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let (st, inv) = req(&app, "POST", &format!("/api/spaces/{space}/invites"), &ta, None).await;
    assert_eq!(st, StatusCode::CREATED);
    let code = inv["code"].as_str().unwrap().to_string();
    // Le code est lisible : « MotMot#chiffre » (pas un UUID).
    assert!(code.contains('#'), "code lisible attendu, reçu {code}");
    let (_, digit) = code.split_once('#').unwrap();
    assert_eq!(digit.len(), 1);

    // Bob rejoint en tapant le code en MAJUSCULES + espaces → doit marcher.
    let messy = format!("  {}  ", code.to_uppercase());
    let (st, joined) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({ "code": messy })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED, "join insensible à la casse/espaces");
    assert_eq!(joined["id"].as_str().unwrap(), space.to_string());
}

#[sqlx::test]
async fn create_invite_idempotent_code_stable_puis_neuf_apres_usage(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let invites = format!("/api/spaces/{space}/invites");

    // Deux créations de suite → MÊME code (idempotent, 201 puis 200).
    let (st1, c1) = req(&app, "POST", &invites, &ta, None).await;
    assert_eq!(st1, StatusCode::CREATED);
    let code1 = c1["code"].as_str().unwrap().to_string();
    let (st2, c2) = req(&app, "POST", &invites, &ta, None).await;
    assert_eq!(st2, StatusCode::OK, "réutilisation de l'invitation active");
    assert_eq!(c2["code"].as_str().unwrap(), code1, "code stable");

    // Bob consomme le code.
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({ "code": code1 })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);

    // Une fois consommé, une nouvelle création frappe un code différent.
    let (st3, c3) = req(&app, "POST", &invites, &ta, None).await;
    assert_eq!(st3, StatusCode::CREATED);
    assert_ne!(c3["code"].as_str().unwrap(), code1, "code neuf après usage");
}

#[sqlx::test]
async fn join_refuse_un_code_inconnu(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let bob = seed_user(&pool, "bob").await;
    let tb = token_for(&state, bob);
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({ "code": "NopeNope#9" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
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

// --- Tests : galerie multi-médias (#87) ----------------------------------

#[sqlx::test]
async fn post_galerie_garde_l_ordre_et_se_reordonne(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let m1 = seed_media(&pool, space, alice, "image/jpeg").await;
    let m2 = seed_media(&pool, space, alice, "video/mp4").await;
    let ta = token_for(&state, alice);

    // Création avec 2 médias dans l'ordre [m1, m2].
    let (st, post) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/posts"),
        &ta,
        Some(json!({ "body": "galerie", "mediaIds": [m1, m2] })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    let media = post["media"].as_array().unwrap();
    assert_eq!(media.len(), 2);
    assert_eq!(media[0]["id"], m1.to_string());
    assert_eq!(media[1]["id"], m2.to_string());
    assert_eq!(media[1]["mime"], "video/mp4");
    let post_id = post["id"].as_str().unwrap().to_string();

    // Réordonnancement : [m2, m1].
    let (st, updated) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}/posts/{post_id}"),
        &ta,
        Some(json!({ "mediaIds": [m2, m1] })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let media = updated["media"].as_array().unwrap();
    assert_eq!(media[0]["id"], m2.to_string());
    assert_eq!(media[1]["id"], m1.to_string());
}

#[sqlx::test]
async fn post_refuse_un_media_d_un_autre_espace(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let other = seed_space(&pool, alice).await; // autre salon d'alice
    let foreign = seed_media(&pool, other, alice, "image/jpeg").await;
    let ta = token_for(&state, alice);

    let (st, _) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/posts"),
        &ta,
        Some(json!({ "body": "x", "mediaIds": [foreign] })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "média hors espace refusé");
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

// --- Tests : autz & validation des routes (RR-02/03, machine à états, SEC-015) -

/// Crée un post via HTTP et renvoie son id.
async fn create_post(app: &Router, space: Uuid, token: &str, body: &str) -> Uuid {
    let (st, p) = req(
        app,
        "POST",
        &format!("/api/spaces/{space}/posts"),
        token,
        Some(json!({ "body": body })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    Uuid::parse_str(p["id"].as_str().unwrap()).unwrap()
}

#[sqlx::test]
async fn post_modifie_ou_supprime_par_non_auteur_refuse(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await; // bob est membre, mais pas l'auteur
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let post = create_post(&app, space, &ta, "mon récit").await;
    let path = format!("/api/spaces/{space}/posts/{post}");

    // Bob (membre, non-auteur) ne peut ni supprimer ni éditer (RR-03 → 403).
    let (st, _) = req(&app, "DELETE", &path, &tb, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = req(&app, "PATCH", &path, &tb, Some(json!({ "body": "pirate" }))).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    // L'auteur, lui, peut supprimer.
    let (st, _) = req(&app, "DELETE", &path, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn post_recit_trop_long_refuse(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);

    let huge = "a".repeat(64 * 1024 + 1); // > MAX_BODY_LEN
    let (st, _) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/posts"),
        &ta,
        Some(json!({ "body": huge })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "récit borné (RR-02)");
}

#[sqlx::test]
async fn commentaire_vide_ou_trop_long_refuse_et_autz_suppression(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let post = create_post(&app, space, &ta, "récit").await;
    let comments = format!("/api/spaces/{space}/posts/{post}/comments");

    // Vide → 400.
    let (st, _) = req(&app, "POST", &comments, &tb, Some(json!({ "body": "  " }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "commentaire vide");
    // Trop long → 400.
    let huge = "a".repeat(8 * 1024 + 1);
    let (st, _) = req(&app, "POST", &comments, &tb, Some(json!({ "body": huge }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "commentaire borné (RR-02)");

    // Bob commente, Alice (non-auteure du commentaire) ne peut pas le supprimer.
    let (st, c) = req(&app, "POST", &comments, &tb, Some(json!({ "body": "joli" }))).await;
    assert_eq!(st, StatusCode::CREATED);
    let cid = c["id"].as_str().unwrap();
    let (st, _) = req(
        &app,
        "DELETE",
        &format!("{comments}/{cid}"),
        &ta,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND, "autz auteur du commentaire");
}

/// Crée un défi via HTTP (auteur = proposeur) et renvoie son id.
async fn create_challenge(app: &Router, space: Uuid, token: &str) -> Uuid {
    let (st, ch) = req(
        app,
        "POST",
        &format!("/api/spaces/{space}/challenges"),
        token,
        Some(json!({ "title": "Un défi", "description": "desc", "intensity": "hot" })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    Uuid::parse_str(ch["id"].as_str().unwrap()).unwrap()
}

#[sqlx::test]
async fn defi_machine_etat_via_http(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await; // proposeuse
    let bob = seed_user(&pool, "bob").await; // destinataire
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    // Transition interdite par la machine (proposed → jobDone) → 409.
    let ch = create_challenge(&app, space, &ta).await;
    let tr = format!("/api/spaces/{space}/challenges/{ch}/transitions");
    let (st, _) = req(&app, "POST", &tr, &tb, Some(json!({ "to": "jobDone" }))).await;
    assert_eq!(st, StatusCode::CONFLICT, "transition non autorisée");

    // SEC-015 : la proposeuse ne peut pas accepter sa propre proposition → 403.
    let (st, _) = req(&app, "POST", &tr, &ta, Some(json!({ "to": "challengeAccepted" }))).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "proposeuse ne s'auto-accepte pas");

    // Le destinataire, lui, peut accepter → 200.
    let (st, ch_json) =
        req(&app, "POST", &tr, &tb, Some(json!({ "to": "challengeAccepted" }))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(ch_json["status"], "challengeAccepted");
}
