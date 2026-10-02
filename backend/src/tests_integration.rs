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

pub(crate) fn test_config() -> Config {
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
    build_app_with(pool, test_config())
}

pub(crate) fn build_app_with(pool: PgPool, config: Config) -> (Router, AppState) {
    let (events, _) = tokio::sync::broadcast::channel(256);
    let state = AppState {
        pool,
        config: Arc::new(config),
        http: reqwest::Client::new(),
        push_client: Arc::new(web_push::HyperWebPushClient::new()),
        oidc_states: Arc::new(Mutex::new(Default::default())),
        oidc_tickets: Arc::new(Mutex::new(Default::default())),
        oidc_cache: Arc::new(Mutex::new(None)),
        events,
        rate_limiter: Arc::new(crate::rate_limit::RateLimiter::new()),
        ws_connections: Arc::new(crate::rate_limit::ConnectionTracker::new()),
    };
    let app = crate::routes::api_router().with_state(state.clone());
    (app, state)
}

pub(crate) async fn seed_user(pool: &PgPool, name: &str) -> Uuid {
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

pub(crate) async fn seed_space(pool: &PgPool, owner: Uuid) -> Uuid {
    let id: Uuid =
        sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('Salon') RETURNING id")
            .fetch_one(pool)
            .await
            .unwrap();
    add_member(pool, owner, id).await;
    id
}

pub(crate) async fn add_member(pool: &PgPool, user: Uuid, space: Uuid) {
    sqlx::query("INSERT INTO space_memberships (user_id, space_id) VALUES ($1, $2)")
        .bind(user)
        .bind(space)
        .execute(pool)
        .await
        .unwrap();
}

pub(crate) fn token_for(state: &AppState, user: Uuid) -> String {
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
pub(crate) async fn req(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        // Le harnais appelle le routeur directement via `oneshot` (pas de vrai
        // listener TCP) : `ConnectInfo` n'est jamais posé. `X-Real-IP` fait
        // passer l'extracteur `ClientIp` (rate limiting) comme en prod derrière
        // nginx, plutôt que de dépendre d'une info de connexion absente ici.
        .header("x-real-ip", "127.0.0.1");
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

    // … et une entrée « downloadEnabled » dans le centre de notifications.
    let (_, notifs) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/notifications"),
        &tb,
        None,
    )
    .await;
    let notifs = notifs.as_array().unwrap();
    assert_eq!(notifs.len(), 1);
    assert_eq!(notifs[0]["kind"], "downloadEnabled");
    assert_eq!(notifs[0]["read"], false);

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
pub(crate) async fn create_post(app: &Router, space: Uuid, token: &str, body: &str) -> Uuid {
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
pub(crate) async fn create_challenge(app: &Router, space: Uuid, token: &str) -> Uuid {
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

// --- Tests : view_once, blind-mood (SQL), pagination curseur -----------------

/// Upload multipart d'un petit média et renvoie son id (exerce la route upload).
async fn upload_media(app: &Router, space: Uuid, token: &str, view_once: bool) -> Uuid {
    let b = "PinkBoundary";
    let body = format!(
        "--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.jpg\"\r\n\
         Content-Type: image/jpeg\r\n\r\nHELLOIMG\r\n\
         --{b}\r\nContent-Disposition: form-data; name=\"viewOnce\"\r\n\r\n{view_once}\r\n\
         --{b}--\r\n",
    );
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/spaces/{space}/media"))
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(
                    header::CONTENT_TYPE,
                    format!("multipart/form-data; boundary={b}"),
                )
                // Comme `req()` : `oneshot` ne pose pas de `ConnectInfo`, il faut
                // fournir `X-Real-IP` pour que `ClientIp` (rate limiting upload,
                // SECURITY_FINDINGS.md #13) s'extraie sans échouer en 500.
                .header("x-real-ip", "127.0.0.1")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let j: Value = serde_json::from_slice(&bytes).unwrap();
    Uuid::parse_str(j["id"].as_str().unwrap()).unwrap()
}

#[sqlx::test]
async fn media_view_once_consomme_apres_une_lecture(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);

    let mid = upload_media(&app, space, &ta, true).await;
    let path = format!("/api/spaces/{space}/media/{mid}");

    // 1ʳᵉ lecture : le média éphémère est servi.
    let (st, _) = req(&app, "GET", &path, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    // 2ᵉ lecture : envolé (consommé → NotFound).
    let (st, _) = req(&app, "GET", &path, &ta, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "view_once consommé");
}

#[sqlx::test]
async fn blind_mood_masque_le_statut_des_autres_avant_mon_vote(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    sqlx::query("UPDATE spaces SET blind_mood = true WHERE id = $1")
        .bind(space)
        .execute(&pool)
        .await
        .unwrap();
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let moods = format!("/api/spaces/{space}/moods");

    // Bob vote.
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{moods}/me"),
        &tb,
        Some(json!({ "status": "cuddleNeeded" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Alice n'a pas voté : elle voit QUE bob a voté, mais pas QUOI (status null).
    let (st, list) = req(&app, "GET", &moods, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["userId"].as_str().unwrap(), bob.to_string());
    assert!(arr[0]["status"].is_null(), "statut masqué avant mon vote");

    // Alice vote à son tour → l'humeur de bob est révélée.
    let (_, _) = req(
        &app,
        "PUT",
        &format!("{moods}/me"),
        &ta,
        Some(json!({ "status": "flirty" })),
    )
    .await;
    let (_, list) = req(&app, "GET", &moods, &ta, None).await;
    let bob_entry = list
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["userId"].as_str().unwrap() == bob.to_string())
        .unwrap();
    assert_eq!(bob_entry["status"], "cuddleNeeded", "révélé après mon vote");
}

#[sqlx::test]
async fn posts_pagination_par_curseur(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);

    for i in 0..3 {
        create_post(&app, space, &ta, &format!("post {i}")).await;
    }
    let base = format!("/api/spaces/{space}/posts");

    // Page 1 : 2 plus récents, hasMore = true.
    let (st, p1) = req(&app, "GET", &format!("{base}?limit=2"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(p1["items"].as_array().unwrap().len(), 2);
    assert_eq!(p1["hasMore"], true);

    // Page 2 : curseur = createdAt du dernier item reçu → le 3ᵉ post, hasMore = false.
    let cursor = p1["items"][1]["createdAt"].as_str().unwrap().replace(':', "%3A");
    let (st, p2) = req(&app, "GET", &format!("{base}?limit=2&before={cursor}"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(p2["items"].as_array().unwrap().len(), 1);
    assert_eq!(p2["hasMore"], false);
}

#[sqlx::test]
async fn favori_personnel_par_utilisateur(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let post = create_post(&app, space, &ta, "récit").await;
    let fav = format!("/api/spaces/{space}/posts/{post}/favorite");
    let list = format!("/api/spaces/{space}/posts");

    // Au départ : non favori pour les deux.
    let (_, p) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(p["items"][0]["isFavorite"], false);

    // Alice le met en favori (idempotent).
    let (st, r) = req(&app, "PUT", &fav, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(r["favorite"], true);
    let (_, p) = req(&app, "PUT", &fav, &ta, None).await; // re-PUT
    assert_eq!(p["favorite"], true);

    // C'est PERSONNEL : favori pour Alice, pas pour Bob.
    let (_, pa) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(pa["items"][0]["isFavorite"], true, "favori d'Alice");
    let (_, pb) = req(&app, "GET", &list, &tb, None).await;
    assert_eq!(pb["items"][0]["isFavorite"], false, "Bob n'a pas le favori");

    // Alice le retire.
    let (st, r) = req(&app, "DELETE", &fav, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(r["favorite"], false);
    let (_, pa) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(pa["items"][0]["isFavorite"], false);
}

#[sqlx::test]
async fn desires_double_consentement_et_gating(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let list = format!("/api/spaces/{space}/desires");
    let stance = format!("/api/spaces/{space}/desires/oilMassage/stance");
    let want = || Some(json!({ "stance": "want" }));

    // Désactivé par défaut → 403 (gating, #99).
    let (st, _) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN, "désactivé par défaut");

    // Alice active la fonctionnalité sur le salon.
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}"),
        &ta,
        Some(json!({ "desiresEnabled": true })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Catalogue catégorisé (136 codes ; 7 catégories dont « practices » et
    // « positions » qui cumule les 64 Kamasutra + 22 modernes + 1 prompt
    // rotatif, #0033/#0037/#0038 ; +7 items venus de l'ancienne catégorie « Menu du soir », #0042).
    let (st, items) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    let arr = items.as_array().unwrap();
    assert_eq!(arr.len(), 136, "catalogue complet v5 (catalogue partagé)");
    assert!(arr
        .iter()
        .all(|i| i["matched"] == false && i["done"] == false && i["limit"] == false));
    assert_eq!(
        arr.iter().find(|i| i["code"] == "oilMassage").unwrap()["category"],
        "tender"
    );
    assert_eq!(
        arr.iter().find(|i| i["code"] == "fellatio").unwrap()["category"],
        "practices"
    );

    // Code inconnu / stance invalide → 404 / 400.
    let (st, _) = req(
        &app,
        "PUT",
        &format!("/api/spaces/{space}/desires/inconnu/stance"),
        &ta,
        want(),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = req(&app, "PUT", &stance, &ta, Some(json!({ "stance": "x" }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Alice « want » : intéressée mais PAS encore matchée.
    let (st, a) = req(&app, "PUT", &stance, &ta, want()).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(a["interested"], true);
    assert_eq!(a["matched"], false);

    // Double-aveugle : Bob ne voit RIEN de l'envie d'Alice.
    let (_, ib) = req(&app, "GET", &list, &tb, None).await;
    let mb = ib.as_array().unwrap().iter().find(|i| i["code"] == "oilMassage").unwrap();
    assert_eq!(mb["interested"], false);
    assert_eq!(mb["matched"], false, "secret d'Alice non révélé");
    assert_eq!(mb["limit"], false);

    // Bob « want » à son tour → MATCH des deux côtés.
    let (_, b) = req(&app, "PUT", &stance, &tb, want()).await;
    assert_eq!(b["matched"], true, "Bob complète → match");
    let (_, ia) = req(&app, "GET", &list, &ta, None).await;
    let ma = ia.as_array().unwrap().iter().find(|i| i["code"] == "oilMassage").unwrap();
    assert_eq!(ma["matched"], true, "match révélé chez Alice aussi");

    // « Contre » = LIMITE surfacée : Bob passe « against » → limite visible des
    // DEUX, match cassé.
    let (_, b) = req(&app, "PUT", &stance, &tb, Some(json!({ "stance": "against" }))).await;
    assert_eq!(b["against"], true);
    assert_eq!(b["limit"], true);
    assert_eq!(b["matched"], false, "un contre casse le match");
    let (_, ia) = req(&app, "GET", &list, &ta, None).await;
    let ma = ia.as_array().unwrap().iter().find(|i| i["code"] == "oilMassage").unwrap();
    assert_eq!(ma["limit"], true, "la limite de Bob est surfacée à Alice");
    assert_eq!(ma["matched"], false, "plus de match");
    assert_eq!(ma["against"], false, "ce n'est pas MA limite");

    // « ✓ Réalisé » niveau SALON : visible des deux, indépendant du stance.
    let done = format!("/api/spaces/{space}/desires/oilMassage/done");
    let (st, d) = req(&app, "PUT", &done, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(d["done"], true);
    let (_, ib) = req(&app, "GET", &list, &tb, None).await;
    assert_eq!(
        ib.as_array().unwrap().iter().find(|i| i["code"] == "oilMassage").unwrap()["done"],
        true,
        "réalisé visible du couple"
    );

    // Bob lève sa limite (clear) → plus de limite.
    let (st, b) = req(&app, "DELETE", &stance, &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(b["against"], false);
    let (_, ia) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(
        ia.as_array().unwrap().iter().find(|i| i["code"] == "oilMassage").unwrap()["limit"],
        false,
        "limite levée"
    );
}

#[sqlx::test]
async fn menu_du_soir_match_du_jour_et_gating(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let list = format!("/api/spaces/{space}/evening-menu");
    let massage = format!("/api/spaces/{space}/evening-menu/evening-massage");

    // Désactivé par défaut → 403.
    let (st, _) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    // Activation.
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}"),
        &ta,
        Some(json!({ "eveningMenuEnabled": true })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Catalogue connecté à la banque (#0039) : tout le catalogue actif (hors prompt
    // rotatif) est listé — 135 items (3 doublons désactivés par 0042), dont ceux répartis
    // en 3 services (entrée/plat/dessert), rien de coché.
    let (st, items) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(items.as_array().unwrap().len(), 135);

    // Item inconnu → 404.
    let (st, _) = req(
        &app,
        "PUT",
        &format!("/api/spaces/{space}/evening-menu/zzz"),
        &ta,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Alice coche « massage » : choisi, pas encore matché.
    let (st, a) = req(&app, "PUT", &massage, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(a["picked"], true);
    assert_eq!(a["matched"], false);

    // Double-aveugle : Bob ne voit rien.
    let (_, items_b) = req(&app, "GET", &list, &tb, None).await;
    let m_b = items_b
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["code"] == "evening-massage")
        .unwrap();
    assert_eq!(m_b["picked"], false);
    assert_eq!(m_b["matched"], false);

    // Bob coche « massage » → match du soir des deux côtés.
    let (st, b) = req(&app, "PUT", &massage, &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(b["matched"], true);
    let (_, items_a) = req(&app, "GET", &list, &ta, None).await;
    let m_a = items_a
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["code"] == "evening-massage")
        .unwrap();
    assert_eq!(m_a["matched"], true);

    // « Hier » : une coche datée de la veille ne compte pas pour ce soir.
    sqlx::query(
        "INSERT INTO evening_menu_picks (space_id, user_id, code, day)
         VALUES ($1, $2, 'evening-movie', ((now() AT TIME ZONE
            (SELECT timezone FROM spaces WHERE id = $1))::date - 1))",
    )
    .bind(space)
    .bind(bob)
    .execute(&pool)
    .await
    .unwrap();
    let (_, again) = req(&app, "PUT", &format!("{list}/evening-movie"), &ta, None).await;
    assert_eq!(again["matched"], false, "la coche d'hier ne matche pas ce soir");

    // Alice retire « massage » → plus de match.
    let (st, a) = req(&app, "DELETE", &massage, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(a["picked"], false);
    assert_eq!(a["matched"], false);
}

#[sqlx::test]
async fn menu_du_soir_mode_ouvert_valider_refuser(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    // Active le menu + bascule en mode ouvert (#0040).
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}"),
        &ta,
        Some(json!({ "eveningMenuEnabled": true, "eveningMenuBlind": false })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    let list = format!("/api/spaces/{space}/evening-menu");
    let massage = format!("/api/spaces/{space}/evening-menu/evening-massage");

    // Alice propose « massage » : visible tout de suite chez Bob (pas besoin
    // d'une coche identique en aveugle), et déjà « matched » (silence = inclus
    // par défaut, un seul statut).
    let (st, a) = req(&app, "PUT", &massage, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(a["picked"], true);
    assert_eq!(a["matched"], true, "silence de l'autre côté = inclus par défaut");

    let (_, ib) = req(&app, "GET", &list, &tb, None).await;
    let m_b = ib
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["code"] == "evening-massage")
        .unwrap();
    assert_eq!(m_b["partnerWants"], true, "proposition visible tout de suite");
    assert_eq!(m_b["matched"], true);
    assert_eq!(m_b["picked"], false, "Bob n'a rien coché lui-même");

    // Bob valide (= coche à son tour) → toujours matché, un seul statut visuel.
    let (st, b) = req(&app, "PUT", &massage, &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(b["matched"], true);

    // Bob change d'avis et refuse → exclu du menu pour les deux, badge visible.
    let (st, b) = req(
        &app,
        "PUT",
        &massage,
        &tb,
        Some(json!({ "stance": "refused" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(b["refused"], true);
    assert_eq!(b["matched"], false, "un refus exclut, même si Alice veut toujours");
    let (_, ia) = req(&app, "GET", &list, &ta, None).await;
    let m_a = ia
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["code"] == "evening-massage")
        .unwrap();
    assert_eq!(m_a["refused"], true, "le refus est visible côté proposeur·se aussi");
    assert_eq!(m_a["matched"], false);
    assert_eq!(m_a["picked"], true, "Alice veut toujours, juste exclu par le refus");

    // Le refus est indisponible en mode aveugle.
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}"),
        &ta,
        Some(json!({ "eveningMenuBlind": true })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = req(
        &app,
        "PUT",
        &massage,
        &ta,
        Some(json!({ "stance": "refused" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn mots_doux_immediat_differe_scelle_et_autz(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let notes = format!("/api/spaces/{space}/love-notes");

    // Mot immédiat d'Alice → lisible par Bob tout de suite.
    let (st, n) = req(&app, "POST", &notes, &ta, Some(json!({ "body": "je t'aime" }))).await;
    assert_eq!(st, StatusCode::CREATED);
    assert_eq!(n["sealed"], false);
    let (_, list_b) = req(&app, "GET", &notes, &tb, None).await;
    assert_eq!(list_b[0]["body"], "je t'aime", "mot immédiat lisible");
    assert_eq!(list_b[0]["sealed"], false);

    // Mot vide → 400.
    let (st, _) = req(&app, "POST", &notes, &ta, Some(json!({ "body": "  " }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Mot différé d'Alice (ouverture demain) → SCELLÉ pour Bob (corps caché).
    let tomorrow =
        (chrono::Utc::now() + chrono::Duration::days(1)).to_rfc3339();
    let (st, nd) = req(
        &app,
        "POST",
        &notes,
        &ta,
        Some(json!({ "body": "surprise", "openAt": tomorrow })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    // L'auteure voit son propre mot différé.
    assert_eq!(nd["body"], "surprise");
    assert_eq!(nd["sealed"], false);
    // Bob ne voit qu'un teaser scellé (corps null, date présente).
    let (_, list_b) = req(&app, "GET", &notes, &tb, None).await;
    let sealed = list_b
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["sealed"] == true)
        .expect("un mot scellé côté Bob");
    assert!(sealed["body"].is_null(), "corps masqué tant que scellé");
    assert!(!sealed["openAt"].is_null(), "la date d'ouverture est visible");

    // Bob ne peut pas supprimer le mot d'Alice (autz auteur·e → 404).
    let nid = n["id"].as_str().unwrap();
    let (st, _) = req(&app, "DELETE", &format!("{notes}/{nid}"), &tb, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    // Alice, oui.
    let (st, _) = req(&app, "DELETE", &format!("{notes}/{nid}"), &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
}

// --- Tests : auth (register/login/me/logout-all), seen, suggestions ----------

#[sqlx::test]
async fn auth_register_login_me_flux_et_mauvais_identifiants(pool: PgPool) {
    let (app, _state) = build_app(pool.clone());

    // Register : l'email est normalisé (trim + minuscules).
    let (st, r) = req(
        &app,
        "POST",
        "/api/auth/register",
        "",
        Some(json!({ "email": "  Zoe@Test.Local ", "displayName": "Zoe", "password": "motdepasse" })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    let token = r["token"].as_str().unwrap().to_string();
    assert_eq!(r["user"]["email"], "zoe@test.local");

    // /me avec le jeton.
    let (st, me) = req(&app, "GET", "/api/auth/me", &token, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(me["displayName"], "Zoe");

    // Login OK (email en casse différente).
    let (st, _) = req(
        &app,
        "POST",
        "/api/auth/login",
        "",
        Some(json!({ "email": "ZOE@test.local", "password": "motdepasse" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Mauvais mot de passe → 401.
    let (st, _) = req(
        &app,
        "POST",
        "/api/auth/login",
        "",
        Some(json!({ "email": "zoe@test.local", "password": "faux" })),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);

    // Email inconnu → 401 (même réponse, anti-énumération).
    let (st, _) = req(
        &app,
        "POST",
        "/api/auth/login",
        "",
        Some(json!({ "email": "personne@test.local", "password": "motdepasse" })),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn update_me_change_le_nom_et_valide(pool: PgPool) {
    let (app, _state) = build_app(pool.clone());
    let (_st, r) = req(
        &app,
        "POST",
        "/api/auth/register",
        "",
        Some(json!({ "email": "n@test.local", "displayName": "Avant", "password": "motdepasse" })),
    )
    .await;
    let token = r["token"].as_str().unwrap().to_string();

    // Nom vide → 400.
    let (st, _) = req(&app, "PATCH", "/api/auth/me", &token, Some(json!({ "displayName": "  " }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Renommage OK (trim appliqué).
    let (st, u) = req(&app, "PATCH", "/api/auth/me", &token, Some(json!({ "displayName": "  Après  " }))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(u["displayName"], "Après");

    // /me reflète le nouveau nom.
    let (_, me) = req(&app, "GET", "/api/auth/me", &token, None).await;
    assert_eq!(me["displayName"], "Après");
}

#[sqlx::test]
async fn auth_register_refuse_mdp_court_et_email_deja_pris(pool: PgPool) {
    let (app, _state) = build_app(pool.clone());
    let body = |p: &str| json!({ "email": "a@test.local", "displayName": "A", "password": p });

    // Mot de passe < 8 → 400.
    let (st, _) = req(&app, "POST", "/api/auth/register", "", Some(body("court"))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Création OK.
    let (st, _) = req(&app, "POST", "/api/auth/register", "", Some(body("motdepasse"))).await;
    assert_eq!(st, StatusCode::CREATED);

    // Email déjà pris → 400 générique (jamais « email existe »).
    let (st, _) = req(&app, "POST", "/api/auth/register", "", Some(body("autremotdepasse"))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

// --- Tests : rate limiting (SECURITY_FINDINGS.md #1-2) ----------------------

/// `req()` pose toujours `X-Real-IP: 127.0.0.1` (cf. le harnais) : toutes les
/// requêtes d'un même test partagent donc la même clé de rate limiting.
#[sqlx::test]
async fn register_rate_limite_apres_n_tentatives(pool: PgPool) {
    let (app, _state) = build_app(pool.clone());
    let body = |n: usize| {
        json!({ "email": format!("rl{n}@test.local"), "displayName": "RL", "password": "motdepasse" })
    };
    // Les REGISTER_MAX_ATTEMPTS (5) premières tentatives passent la garde de
    // rate limiting (chacune un email distinct → 201, pas de 400 « déjà pris »).
    for i in 0..5 {
        let (st, _) = req(&app, "POST", "/api/auth/register", "", Some(body(i))).await;
        assert_eq!(st, StatusCode::CREATED, "tentative {i} sous la limite");
    }
    // La 6e, dans la même fenêtre, est rate limitée avant même la validation.
    let (st, _) = req(&app, "POST", "/api/auth/register", "", Some(body(99))).await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn login_rate_limite_apres_n_tentatives(pool: PgPool) {
    let (app, _state) = build_app(pool.clone());
    let attempt = || json!({ "email": "personne@test.local", "password": "x" });
    // Les LOGIN_MAX_ATTEMPTS (10) premières tentatives passent la garde (401 :
    // email inconnu, anti-énumération — cf. auth_register_login_me_flux…).
    for i in 0..10 {
        let (st, _) = req(&app, "POST", "/api/auth/login", "", Some(attempt())).await;
        assert_eq!(st, StatusCode::UNAUTHORIZED, "tentative {i} sous la limite");
    }
    let (st, _) = req(&app, "POST", "/api/auth/login", "", Some(attempt())).await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn join_rate_limite_apres_n_tentatives(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let bob = seed_user(&pool, "bob").await;
    let tb = token_for(&state, bob);
    let attempt = || json!({ "code": "NopeNope#9" });
    // Les JOIN_MAX_ATTEMPTS (8) premières tentatives passent la garde de rate
    // limiting (400 : code inconnu — le rate limiting est vérifié AVANT le
    // lookup en base, donc un code toujours invalide suffit à le tester).
    for i in 0..8 {
        let (st, _) = req(&app, "POST", "/api/spaces/join", &tb, Some(attempt())).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "tentative {i} sous la limite");
    }
    let (st, _) = req(&app, "POST", "/api/spaces/join", &tb, Some(attempt())).await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS);
}

/// SECURITY_FINDINGS.md #13 : l'upload média n'avait aucune limite de fréquence,
/// laissant un membre enchaîner des requêtes de 100 Mo sans frein (CWE-400).
#[sqlx::test]
async fn upload_media_rate_limite_apres_n_tentatives(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let b = "PinkBoundary";
    let body = format!(
        "--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.jpg\"\r\n\
         Content-Type: image/jpeg\r\n\r\nHELLOIMG\r\n--{b}--\r\n",
    );

    // Les UPLOAD_MAX_ATTEMPTS (30) premiers uploads passent.
    for i in 0..30 {
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/spaces/{space}/media"))
                    .header(header::AUTHORIZATION, format!("Bearer {ta}"))
                    .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={b}"))
                    .header("x-real-ip", "127.0.0.1")
                    .body(Body::from(body.clone()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED, "upload {i} sous la limite");
    }
    // Le 31e est bloqué.
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/spaces/{space}/media"))
                .header(header::AUTHORIZATION, format!("Bearer {ta}"))
                .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={b}"))
                .header("x-real-ip", "127.0.0.1")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn logout_all_revoque_les_anciens_jetons(pool: PgPool) {
    let (app, _state) = build_app(pool.clone());
    let (_st, r) = req(
        &app,
        "POST",
        "/api/auth/register",
        "",
        Some(json!({ "email": "z@test.local", "displayName": "Z", "password": "motdepasse" })),
    )
    .await;
    let token = r["token"].as_str().unwrap().to_string();

    let (st, _) = req(&app, "GET", "/api/auth/me", &token, None).await;
    assert_eq!(st, StatusCode::OK);

    // Le `iat` du JWT est en secondes entières ; on laisse passer une seconde
    // pour que `min_token_iat = now()` soit strictement postérieur au jeton.
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    let (st, _) = req(&app, "POST", "/api/auth/logout-all", &token, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    // Le jeton d'avant le logout-all est invalidé (min_token_iat).
    let (st, _) = req(&app, "GET", "/api/auth/me", &token, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "ancien jeton révoqué (SEC-003)");
}

#[sqlx::test]
async fn seen_marque_et_liste_et_refuse_fil_inconnu(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);

    // Fil inconnu → 400.
    let (st, _) = req(&app, "PUT", &format!("/api/spaces/{space}/seen/inconnu"), &ta, None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Marque « blog » vu.
    let (st, e) = req(&app, "PUT", &format!("/api/spaces/{space}/seen/blog"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(e["feature"], "blog");

    // La liste reflète le « vu ».
    let (st, list) = req(&app, "GET", &format!("/api/spaces/{space}/seen"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert!(list
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["feature"] == "blog" && s["userId"].as_str().unwrap() == alice.to_string()));
}

#[sqlx::test]
async fn seen_refuse_un_non_membre(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let intrus = seed_user(&pool, "intrus").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, intrus);
    let (st, _) = req(&app, "GET", &format!("/api/spaces/{space}/seen"), &t, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

// --- Tests : centre de notifications ---------------------------------------

#[sqlx::test]
async fn notification_creee_listee_marquee_lue_et_isolee_par_destinataire(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let notifs = format!("/api/spaces/{space}/notifications");

    // Alice publie un post → une notification "post" pour Bob, aucune pour elle.
    create_post(&app, space, &ta, "récit").await;

    let (st, count) = req(&app, "GET", &format!("{notifs}/unread-count"), &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(count["count"], 1);

    let (st, list) = req(&app, "GET", &notifs, &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    let items = list.as_array().unwrap();
    assert_eq!(items.len(), 1, "une seule notification pour Bob");
    assert_eq!(items[0]["kind"], "post");
    assert_eq!(items[0]["actorName"], "alice");
    assert_eq!(items[0]["read"], false);
    let id = items[0]["id"].as_str().unwrap().to_string();

    // Alice n'a rien reçu de sa propre publication.
    let (_, mine) = req(&app, "GET", &notifs, &ta, None).await;
    assert_eq!(mine.as_array().unwrap().len(), 0);

    // Marquer lue → reflété dans la liste et le compteur.
    let (st, _) = req(&app, "PUT", &format!("{notifs}/{id}/read"), &tb, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (_, count) = req(&app, "GET", &format!("{notifs}/unread-count"), &tb, None).await;
    assert_eq!(count["count"], 0);
    let (_, list) = req(&app, "GET", &notifs, &tb, None).await;
    assert_eq!(list[0]["read"], true);

    // Marquer une deuxième fois est idempotent (pas d'erreur).
    let (st, _) = req(&app, "PUT", &format!("{notifs}/{id}/read"), &tb, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    // Un id inconnu → 404.
    let (st, _) = req(&app, "PUT", &format!("{notifs}/{}/read", Uuid::new_v4()), &tb, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn notifications_read_all_marque_tout_lu(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let notifs = format!("/api/spaces/{space}/notifications");

    create_post(&app, space, &ta, "un").await;
    create_post(&app, space, &ta, "deux").await;
    let (_, count) = req(&app, "GET", &format!("{notifs}/unread-count"), &tb, None).await;
    assert_eq!(count["count"], 2);

    let (st, _) = req(&app, "PUT", &format!("{notifs}/read-all"), &tb, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (_, count) = req(&app, "GET", &format!("{notifs}/unread-count"), &tb, None).await;
    assert_eq!(count["count"], 0);
}

#[sqlx::test]
async fn notifications_refuse_un_non_membre(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let intrus = seed_user(&pool, "intrus").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, intrus);
    let (st, _) = req(&app, "GET", &format!("/api/spaces/{space}/notifications"), &t, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

/// La migration 0034 backfille `notifications` depuis l'historique préexistant
/// (posts/commentaires/défis/mots doux/notices/envies/menu du soir). Comme
/// `#[sqlx::test]` applique les migrations AVANT le corps du test (donc sur une
/// base encore vide), on seed d'abord des données « historiques » en SQL brut
/// puis on réexécute cette migration explicitement pour valider son contenu —
/// c'est exactement l'ordre réel sur `develop`/`prod`, où la migration tourne
/// une fois sur une base déjà peuplée.
#[sqlx::test]
async fn backfill_0034_reconstitue_l_historique_marque_lu(pool: PgPool) {
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;

    let post: Uuid = sqlx::query_scalar(
        "INSERT INTO posts (space_id, author_id, body, draft) VALUES ($1, $2, 'récit', false) RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO post_comments (post_id, author_id, body) VALUES ($1, $2, 'joli')")
        .bind(post)
        .bind(bob)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO challenges (space_id, proposer_id, title, description, intensity)
         VALUES ($1, $2, 'défi', 'desc', 'soft')",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();
    // Mot doux immédiat (alice → bob) + un différé déjà notifié.
    sqlx::query("INSERT INTO love_notes (space_id, author_id, body) VALUES ($1, $2, 'immédiat')")
        .bind(space)
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO love_notes (space_id, author_id, body, open_at, notified)
         VALUES ($1, $2, 'différé', now() - interval '1 hour', true)",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();
    // Notices de salon.
    sqlx::query(
        "INSERT INTO space_notices (space_id, kind, actor_id) VALUES ($1, 'member_joined', $2)",
    )
    .bind(space)
    .bind(bob)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO space_notices (space_id, kind, actor_id) VALUES ($1, 'download_enabled', $2)",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();
    // Match d'envie : alice puis bob veulent le même code.
    sqlx::query(
        "INSERT INTO desire_interests (space_id, user_id, code, stance, created_at)
         VALUES ($1, $2, 'morningCuddle', 'want', now() - interval '2 hour')",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO desire_interests (space_id, user_id, code, stance, created_at)
         VALUES ($1, $2, 'morningCuddle', 'want', now() - interval '1 hour')",
    )
    .bind(space)
    .bind(bob)
    .execute(&pool)
    .await
    .unwrap();
    // Match du menu du soir, même jour.
    sqlx::query(
        "INSERT INTO evening_menu_picks (space_id, user_id, code, day, created_at)
         VALUES ($1, $2, 'evening-cuddle', current_date, now() - interval '2 hour')",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO evening_menu_picks (space_id, user_id, code, day, created_at)
         VALUES ($1, $2, 'evening-cuddle', current_date, now() - interval '1 hour')",
    )
    .bind(space)
    .bind(bob)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(include_str!(
        "../migrations/0034_notifications_backfill.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();

    let bob_kinds: Vec<String> = sqlx::query_scalar(
        "SELECT kind FROM notifications WHERE space_id = $1 AND user_id = $2 ORDER BY kind",
    )
    .bind(space)
    .bind(bob)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        bob_kinds,
        vec!["challenge", "downloadEnabled", "loveNote", "loveNote", "post"],
        "Bob reçoit ce dont Alice est l'actrice, jamais ses propres actions (son commentaire, son 2ᵉ 'want' qui complète le match desire, son 2ᵉ coche qui complète le match eveningMenu — c'est LUI l'acteur de ces deux transitions, donc c'est Alice qui doit les recevoir)",
    );

    let alice_kinds: Vec<String> = sqlx::query_scalar(
        "SELECT kind FROM notifications WHERE space_id = $1 AND user_id = $2 ORDER BY kind",
    )
    .bind(space)
    .bind(alice)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        alice_kinds,
        vec!["comment", "desire", "eveningMenu", "memberJoined"],
    );

    let all_read: bool = sqlx::query_scalar(
        "SELECT bool_and(read_at IS NOT NULL) FROM notifications WHERE space_id = $1",
    )
    .bind(space)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(all_read, "tout le backfill doit être marqué lu");
}

/// La migration 0035 ajoute `entity_id` et relie l'historique déjà backfillé
/// par 0034 (qui n'avait pas encore cette colonne) au post/défi exact — c'est
/// ce qui permet au centre de notifications de scroller/ouvrir l'item précis
/// même pour une notification ANCIENNE, déjà existante avant ce correctif.
#[sqlx::test]
async fn backfill_0035_relie_l_entite_pour_l_historique_deja_backfille(pool: PgPool) {
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;

    let post: Uuid = sqlx::query_scalar(
        "INSERT INTO posts (space_id, author_id, body, draft) VALUES ($1, $2, 'récit', false) RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    let challenge: Uuid = sqlx::query_scalar(
        "INSERT INTO challenges (space_id, proposer_id, title, description, intensity)
         VALUES ($1, $2, 'défi', 'desc', 'soft') RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO post_comments (post_id, author_id, body) VALUES ($1, $2, 'joli')")
        .bind(post)
        .bind(bob)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO space_notices (space_id, kind, actor_id) VALUES ($1, 'member_joined', $2)",
    )
    .bind(space)
    .bind(bob)
    .execute(&pool)
    .await
    .unwrap();

    // Ordre réel de déploiement : 0034 backfille SANS entity_id (colonne pas
    // encore créée à l'époque), puis 0035 ajoute la colonne et relie
    // l'historique. Ici, `#[sqlx::test]` a déjà appliqué TOUTES les
    // migrations (dont 0035) avant le corps du test — sur une base encore
    // vide, donc sans effet — donc la colonne `entity_id` existe déjà : on ne
    // rejoue que la partie `UPDATE` de 0035 (après son `ALTER TABLE`), pas le
    // fichier entier, sous peine de recréer une colonne existante.
    sqlx::raw_sql(include_str!(
        "../migrations/0034_notifications_backfill.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let migration_0035 = include_str!("../migrations/0035_notifications_entity_id.sql");
    let (_alter, updates) = migration_0035
        .split_once("ALTER TABLE notifications ADD COLUMN entity_id TEXT;")
        .expect("0035 doit contenir son ALTER TABLE tel quel");
    sqlx::raw_sql(updates).execute(&pool).await.unwrap();

    // Bob a reçu la notif "post" d'Alice → doit pointer vers CE post.
    let post_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND user_id = $2 AND kind = 'post'",
    )
    .bind(space)
    .bind(bob)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(post_entity, Some(post.to_string()));

    // Alice a reçu la notif "comment" de Bob → doit pointer vers le POST
    // commenté (pas l'id du commentaire), pour ouvrir le bon fil au clic.
    let comment_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND user_id = $2 AND kind = 'comment'",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(comment_entity, Some(post.to_string()));

    // Bob a reçu la notif "challenge" d'Alice → doit pointer vers CE défi.
    let challenge_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND user_id = $2 AND kind = 'challenge'",
    )
    .bind(space)
    .bind(bob)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(challenge_entity, Some(challenge.to_string()));

    // memberJoined n'a pas d'item précis à ouvrir → reste NULL (pas d'erreur,
    // pas de lien fantôme).
    let member_joined_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND user_id = $2 AND kind = 'memberJoined'",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(member_joined_entity, None);
}

/// 0035 relie `entity_id` par égalité STRICTE de `created_at`, ce qui rate les
/// notifications créées EN DIRECT (pas par le backfill 0034) entre le
/// déploiement de la table `notifications` et celui d'`entity_id` :
/// `notify_members` insérait alors la notification avec son PROPRE `now()`,
/// décalé de quelques millisecondes du `now()` du post/commentaire/défi
/// source (confirmé en prod : écarts réels de 3 à 8 ms). 0036 corrige ça avec
/// une fenêtre de tolérance + "plus proche match" (pas de faux positif).
#[sqlx::test]
async fn backfill_0036_relie_les_notifications_au_timestamp_legerement_decale(pool: PgPool) {
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    // Salon distinct, sans aucun défi : sert de contrôle négatif (rien à
    // relier, même dans la fenêtre de tolérance temporelle).
    let empty_space = seed_space(&pool, alice).await;
    add_member(&pool, bob, empty_space).await;

    let post: Uuid = sqlx::query_scalar(
        "INSERT INTO posts (space_id, author_id, body, draft) VALUES ($1, $2, 'récit', false) RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    let challenge: Uuid = sqlx::query_scalar(
        "INSERT INTO challenges (space_id, proposer_id, title, description, intensity)
         VALUES ($1, $2, 'défi', 'desc', 'soft') RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    // Horodatage nettement plus ancien que `post` (défini juste au-dessus) :
    // sans cet écart, les deux posts d'Alice tomberaient tous deux "proches"
    // de now() et le "plus proche match" deviendrait ambigu entre les deux —
    // ce n'est pas ce que ce test veut vérifier (voir plus bas, la notif
    // "post" doit se relier à `post`, pas à `comment_post`).
    let comment_post: Uuid = sqlx::query_scalar(
        "INSERT INTO posts (space_id, author_id, body, draft, created_at)
         VALUES ($1, $2, 'autre récit', false, now() - interval '1 hour') RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO post_comments (post_id, author_id, body) VALUES ($1, $2, 'joli')")
        .bind(comment_post)
        .bind(bob)
        .execute(&pool)
        .await
        .unwrap();

    // Simule EXACTEMENT le bug observé en prod : `created_at` de la
    // notification = celui de la source + un petit décalage (son propre
    // `now()`, évalué dans un `INSERT` séparé quelques ms plus tard).
    async fn insert_gapped(
        pool: &PgPool,
        space: Uuid,
        recipient: Uuid,
        kind: &str,
        actor: Uuid,
        source_created_at: chrono::DateTime<chrono::Utc>,
    ) {
        sqlx::query(
            "INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
             VALUES ($1, $2, $3, $4, now(), $5 + interval '5 milliseconds')",
        )
        .bind(space)
        .bind(recipient)
        .bind(kind)
        .bind(actor)
        .bind(source_created_at)
        .execute(pool)
        .await
        .unwrap();
    }
    let now = chrono::Utc::now();
    insert_gapped(&pool, space, bob, "post", alice, now).await;
    insert_gapped(&pool, space, bob, "challenge", alice, now).await;
    insert_gapped(&pool, space, alice, "comment", bob, now).await;
    // Contrôle négatif : même motif, mais dans un salon sans aucun défi — ne
    // doit RIEN relier (pas de faux positif par simple proximité temporelle).
    insert_gapped(&pool, empty_space, bob, "challenge", alice, now).await;

    sqlx::raw_sql(include_str!(
        "../migrations/0036_notifications_entity_id_gap.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();

    let post_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND kind = 'post'",
    )
    .bind(space)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(post_entity, Some(post.to_string()));

    let challenge_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND kind = 'challenge'",
    )
    .bind(space)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(challenge_entity, Some(challenge.to_string()));

    let comment_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND kind = 'comment'",
    )
    .bind(space)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(comment_entity, Some(comment_post.to_string()));

    let empty_space_entity: Option<String> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications WHERE space_id = $1 AND kind = 'challenge'",
    )
    .bind(empty_space)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        empty_space_entity, None,
        "sans défi correspondant dans ce salon, entity_id doit rester NULL (pas de faux positif)",
    );
}

/// 0037 relie `entity_id` pour `loveNote`, absent jusqu'ici (0033-0036 le
/// jugeaient sans item précis). Correspondance temporelle la plus proche
/// (comme 0036) : un mot immédiat est notifié quelques ms après son propre
/// `now()` ; un mot différé référence `open_at` (délivrance), pas
/// `created_at` (rédaction, potentiellement bien antérieure).
#[sqlx::test]
async fn backfill_0037_relie_l_entite_des_mots_doux(pool: PgPool) {
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;

    let immediate: Uuid = sqlx::query_scalar(
        "INSERT INTO love_notes (space_id, author_id, body) VALUES ($1, $2, 'immédiat') RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    // Mot différé : rédigé il y a longtemps, délivré (notified) il y a peu —
    // le matching doit se faire sur `open_at`, pas `created_at`.
    let deferred: Uuid = sqlx::query_scalar(
        "INSERT INTO love_notes (space_id, author_id, body, open_at, notified, created_at)
         VALUES ($1, $2, 'différé', now() - interval '1 hour', true, now() - interval '30 days')
         RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Simule l'écart de quelques ms entre le `now()` du mot et celui de la
    // notification (même bug de fond que 0034→0036 pour post/comment/challenge).
    sqlx::query(
        "INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
         VALUES ($1, $2, 'loveNote', $3, now(),
                 (SELECT created_at FROM love_notes WHERE id = $4) + interval '5 milliseconds')",
    )
    .bind(space)
    .bind(bob)
    .bind(alice)
    .bind(immediate)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
         VALUES ($1, $2, 'loveNote', $3, now(),
                 (SELECT open_at FROM love_notes WHERE id = $4) + interval '5 milliseconds')",
    )
    .bind(space)
    .bind(bob)
    .bind(alice)
    .bind(deferred)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(include_str!(
        "../migrations/0037_notifications_lovenote_entity_id.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();

    let entities: Vec<Option<String>> = sqlx::query_scalar(
        "SELECT entity_id FROM notifications
         WHERE space_id = $1 AND kind = 'loveNote'
         ORDER BY created_at",
    )
    .bind(space)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        entities,
        vec![Some(deferred.to_string()), Some(immediate.to_string())],
    );
}

/// 0039 relie `comment_id` (le commentaire précis à surligner) en plus
/// d'`entity_id` (le post, qui reste inchangé — sert à ouvrir le bon fil).
#[sqlx::test]
async fn backfill_0039_relie_le_commentaire_precis(pool: PgPool) {
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;

    let post: Uuid = sqlx::query_scalar(
        "INSERT INTO posts (space_id, author_id, body, draft) VALUES ($1, $2, 'récit', false) RETURNING id",
    )
    .bind(space)
    .bind(alice)
    .fetch_one(&pool)
    .await
    .unwrap();
    // Deux commentaires de Bob sur ce post : le matching doit choisir celui
    // dont l'horodatage est le plus proche de la notification, pas le premier.
    let comment1: Uuid = sqlx::query_scalar(
        "INSERT INTO post_comments (post_id, author_id, body, created_at)
         VALUES ($1, $2, 'premier', now() - interval '2 hour') RETURNING id",
    )
    .bind(post)
    .bind(bob)
    .fetch_one(&pool)
    .await
    .unwrap();
    let comment2: Uuid = sqlx::query_scalar(
        "INSERT INTO post_comments (post_id, author_id, body, created_at)
         VALUES ($1, $2, 'second', now() - interval '1 hour') RETURNING id",
    )
    .bind(post)
    .bind(bob)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Notification pour le second commentaire (entity_id déjà posé, comme le
    // ferait 0035/0036), avec le même écart de quelques ms que le bug réel.
    sqlx::query(
        "INSERT INTO notifications (space_id, user_id, kind, actor_id, entity_id, read_at, created_at)
         VALUES ($1, $2, 'comment', $3, $4, now(),
                 (SELECT created_at FROM post_comments WHERE id = $5) + interval '5 milliseconds')",
    )
    .bind(space)
    .bind(alice)
    .bind(bob)
    .bind(post.to_string())
    .bind(comment2)
    .execute(&pool)
    .await
    .unwrap();

    // `#[sqlx::test]` a déjà appliqué 0039 (dont son `ALTER TABLE`) avant le
    // corps du test, sur une base encore vide → la colonne existe déjà : on
    // ne rejoue que la partie `UPDATE` (cf. même piège que le test 0035).
    let migration_0039 = include_str!("../migrations/0039_notifications_comment_id.sql");
    let (_alter, updates) = migration_0039
        .split_once("ALTER TABLE notifications ADD COLUMN comment_id TEXT;")
        .expect("0039 doit contenir son ALTER TABLE tel quel");
    sqlx::raw_sql(updates).execute(&pool).await.unwrap();

    let (entity_id, comment_id): (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT entity_id, comment_id FROM notifications WHERE space_id = $1 AND kind = 'comment'",
    )
    .bind(space)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(entity_id, Some(post.to_string()), "entity_id (le post) inchangé");
    assert_eq!(
        comment_id,
        Some(comment2.to_string()),
        "doit choisir le commentaire le plus proche dans le temps, pas comment1",
    );
    assert_ne!(comment_id, Some(comment1.to_string()));
}

#[sqlx::test]
async fn suggestions_crud_validation_et_autz(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let base = format!("/api/spaces/{space}/suggestions");

    // Intensité invalide → 400.
    let (st, _) = req(&app, "POST", &base, &ta, Some(json!({ "title": "X", "description": "", "intensity": "nope" }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    // Titre vide → 400.
    let (st, _) = req(&app, "POST", &base, &ta, Some(json!({ "title": "  ", "description": "", "intensity": "hot" }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Création OK.
    let (st, s) = req(&app, "POST", &base, &ta, Some(json!({ "title": "Mon idée", "description": "d", "intensity": "hot" }))).await;
    assert_eq!(st, StatusCode::CREATED);
    let sid = s["id"].as_str().unwrap().to_string();

    // La banque du salon contient ma suggestion.
    let (st, list) = req(&app, "GET", &base, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert!(list.as_array().unwrap().iter().any(|x| x["id"].as_str().unwrap() == sid));

    // Bob (non créateur) ne peut pas l'éditer → 404 (SEC-013).
    let (st, _) = req(&app, "PATCH", &format!("{base}/{sid}"), &tb, Some(json!({ "title": "pirate", "description": "", "intensity": "hot" }))).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Masquer (#70) → 204, la liste la marque hidden.
    let (st, _) = req(&app, "PUT", &format!("{base}/{sid}/hidden"), &ta, Some(json!({ "hidden": true }))).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (_, list) = req(&app, "GET", &base, &ta, None).await;
    let mine = list.as_array().unwrap().iter().find(|x| x["id"].as_str().unwrap() == sid).unwrap();
    assert_eq!(mine["hidden"], true);

    // Le créateur supprime → 204.
    let (st, _) = req(&app, "DELETE", &format!("{base}/{sid}"), &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
}

/// `/api/version` est publique (comme `/api/auth/config`) : sert au check de
/// déploiement et à l'écran Réglages, sans session.
#[sqlx::test]
async fn version_publique_sans_authentification(pool: PgPool) {
    let (app, _state) = build_app(pool);
    let (st, body) = req(&app, "GET", "/api/version", "", None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body["version"], crate::routes::version::VERSION);
    assert_eq!(body["commit"], crate::routes::version::COMMIT);
}

#[sqlx::test]
async fn menu_du_soir_services_parametrables_et_choix_hors_categorie(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let patch = format!("/api/spaces/{space}");
    let list = format!("/api/spaces/{space}/evening-menu");

    let (st, _) = req(&app, "PATCH", &patch, &ta, Some(json!({ "eveningMenuEnabled": true }))).await;
    assert_eq!(st, StatusCode::OK);

    let find = |items: &serde_json::Value, code: &str| -> serde_json::Value {
        items
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["code"] == code)
            .unwrap()
            .clone()
    };

    // La catégorie transverse « evening » a disparu (#0042).
    let (_, all) = req(&app, "GET", &list, &ta, None).await;
    assert!(all.as_array().unwrap().iter().all(|i| i["category"] != "evening"));

    // Défaut du catalogue : un item de « places » n'est dans aucun service,
    // mais reste listé (choisissable hors catégorie).
    let (_, items) = req(&app, "GET", &list, &ta, None).await;
    let places: Vec<_> = items
        .as_array()
        .unwrap()
        .iter()
        .filter(|i| i["category"] == "places")
        .collect();
    assert!(!places.is_empty(), "les items hors services sont listés");
    assert_eq!(places[0]["course"], "");
    let place_code = places[0]["code"].as_str().unwrap().to_string();
    // Le prompt rotatif n'est pas un choix du soir.
    assert!(items.as_array().unwrap().iter().all(|i| i["code"] != "positions-new-monthly"));

    // Choisir cet item DEPUIS « dessert » : le service est mémorisé.
    let (st, picked) = req(
        &app,
        "PUT",
        &format!("{list}/{place_code}"),
        &ta,
        Some(json!({ "course": "dessert" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(picked["course"], "dessert");
    let (_, items) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(find(&items, &place_code)["course"], "dessert");

    // Service invalide → 400.
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{list}/{place_code}"),
        &ta,
        Some(json!({ "course": "brunch" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Classement du salon, en sélection multiple : « tender » alimente Plat ET
    // Dessert ; « practices » l'Entrée ; plus rien d'autre.
    let (_, before) = req(&app, "GET", &list, &ta, None).await;
    let tender_code = before
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["category"] == "tender")
        .unwrap()["code"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(find(&before, &tender_code)["courses"], json!(["starter"]));
    let (st, space_json) = req(
        &app,
        "PATCH",
        &patch,
        &ta,
        Some(json!({
            "eveningCourseCustom": true,
            "eveningCourseCategories": ["main:tender", "dessert:tender", "starter:practices"]
        })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(space_json["eveningCourseCustom"], true);
    assert_eq!(
        space_json["eveningCourseCategories"],
        json!(["main:tender", "dessert:tender", "starter:practices"])
    );
    let (_, after) = req(&app, "GET", &list, &ta, None).await;
    let t = find(&after, &tender_code);
    assert_eq!(t["courses"], json!(["main", "dessert"]), "une catégorie nourrit plusieurs services");
    assert_eq!(t["course"], "main", "service affiché = le premier proposé");
    let games = after.as_array().unwrap().iter().find(|i| i["category"] == "games").unwrap();
    assert_eq!(games["courses"], json!([]), "catégorie décochée partout : aucun service");
    assert_eq!(games["course"], "");

    // Validation : service inconnu, catégorie inconnue, doublon, mal formé → 400.
    for bad in [
        json!(["brunch:tender"]),
        json!(["main:zzz"]),
        json!(["main:tender", "main:tender"]),
        json!(["sans-deux-points"]),
        json!(["none:places"]),
    ] {
        let (st, _) = req(
            &app,
            "PATCH",
            &patch,
            &ta,
            Some(json!({ "eveningCourseCategories": bad })),
        )
        .await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{bad}");
    }

    // Rétablir le classement du catalogue.
    let (st, _) = req(
        &app,
        "PATCH",
        &patch,
        &ta,
        Some(json!({ "eveningCourseCustom": false, "eveningCourseCategories": [] })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let (_, back) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(find(&back, &tender_code)["courses"], json!(["starter"]));
}

/// Double-aveugle (mode par défaut) : ni le service qu'un membre a donné à son
/// choix, ni un évènement temps réel ne doivent trahir un choix non matché.
#[sqlx::test]
async fn menu_du_soir_aveugle_ne_fuite_ni_le_service_ni_un_evenement(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let patch = format!("/api/spaces/{space}");
    let list = format!("/api/spaces/{space}/evening-menu");
    let (st, _) = req(&app, "PATCH", &patch, &ta, Some(json!({ "eveningMenuEnabled": true }))).await;
    assert_eq!(st, StatusCode::OK);

    // Un item hors de tout service par défaut (« places ») : course = "".
    let (_, items_b) = req(&app, "GET", &list, &tb, None).await;
    let code = items_b
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["category"] == "places")
        .unwrap()["code"]
        .as_str()
        .unwrap()
        .to_string();

    let mut rx = state.events.subscribe();

    // Alice le coche DANS « dessert » (choix secret).
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{list}/{code}"),
        &ta,
        Some(json!({ "course": "dessert" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Bob ne doit rien déduire : service inchangé, pas coché, pas matché.
    let (_, items_b) = req(&app, "GET", &list, &tb, None).await;
    let it = items_b.as_array().unwrap().iter().find(|i| i["code"] == code).unwrap();
    assert_eq!(it["course"], "", "le service du choix d'Alice ne doit pas fuiter");
    assert_eq!(it["picked"], false);
    assert_eq!(it["partnerWants"], false);

    // Et la réponse à Bob qui coche à son tour (match) révèle alors le service.
    let (_, bobs) = req(&app, "PUT", &format!("{list}/{code}"), &tb, None).await;
    assert_eq!(bobs["matched"], true);
    assert_eq!(bobs["course"], "dessert", "révélé seulement une fois le match fait");
    // (le match émet un évènement ; on le consomme avant la suite)
    while rx.try_recv().is_ok() {}

    // Retrait d'Alice puis nouveau choix : aucun évènement tant qu'il n'y a pas de match.
    let (st, _) = req(&app, "DELETE", &format!("{list}/{code}"), &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    while rx.try_recv().is_ok() {}
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{list}/{code}"),
        &ta,
        Some(json!({ "course": "dessert" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert!(
        rx.try_recv().is_err(),
        "pas d'évènement temps réel pour un choix non matché en mode aveugle"
    );
    let (st, _) = req(&app, "DELETE", &format!("{list}/{code}"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert!(
        rx.try_recv().is_err(),
        "ni au retrait d'un choix non matché en mode aveugle"
    );
}

/// Mode aveugle : « J'ai fini ». Les choix non matchés ne sont dévoilés que
/// quand TOUS les membres ont validé ; validé = verrouillé.
#[sqlx::test]
async fn menu_du_soir_aveugle_j_ai_fini_devoile_les_non_matchs(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let patch = format!("/api/spaces/{space}");
    let list = format!("/api/spaces/{space}/evening-menu");
    let status = format!("/api/spaces/{space}/evening-menu-status");
    let done = format!("/api/spaces/{space}/evening-menu-done");
    let (st, _) = req(&app, "PATCH", &patch, &ta, Some(json!({ "eveningMenuEnabled": true }))).await;
    assert_eq!(st, StatusCode::OK);

    let find = |items: &serde_json::Value, code: &str| -> serde_json::Value {
        items.as_array().unwrap().iter().find(|i| i["code"] == code).unwrap().clone()
    };
    // Alice : massage + film ; Bob : massage + bain (« evening-bath » est désactivé : cuddle).
    let (a1, a2, b2) = ("evening-massage", "evening-movie", "evening-cuddle");
    for code in [a1, a2] {
        let (st, _) = req(&app, "PUT", &format!("{list}/{code}"), &ta, None).await;
        assert_eq!(st, StatusCode::OK);
    }
    for code in [a1, b2] {
        let (st, _) = req(&app, "PUT", &format!("{list}/{code}"), &tb, None).await;
        assert_eq!(st, StatusCode::OK);
    }

    let (_, s) = req(&app, "GET", &status, &ta, None).await;
    assert_eq!((s["meDone"].clone(), s["doneCount"].clone(), s["memberCount"].clone()), (json!(false), json!(0), json!(2)));

    // Alice valide : verrouillée, rien n'est dévoilé à Bob.
    let (st, s) = req(&app, "PUT", &done, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["meDone"], true);
    assert_eq!(s["revealed"], false);
    let (st, _) = req(&app, "PUT", &format!("{list}/evening-bath"), &ta, None).await;
    assert_eq!(st, StatusCode::CONFLICT, "choix verrouillés après validation");
    let (_, items_b) = req(&app, "GET", &list, &tb, None).await;
    assert_eq!(find(&items_b, a2)["partnerWants"], false, "rien de dévoilé tant que Bob n'a pas fini");

    // Alice se ravise (Bob n'a pas fini) : déverrouillée, puis revalide.
    let (st, s) = req(&app, "DELETE", &done, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["meDone"], false);
    let (st, _) = req(&app, "DELETE", &format!("{list}/{a2}"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = req(&app, "PUT", &format!("{list}/{a2}"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    let (_, s) = req(&app, "PUT", &done, &ta, None).await;
    assert_eq!(s["meDone"], true);

    // Bob valide à son tour : tout est dévoilé, matché ou non.
    let (_, s) = req(&app, "PUT", &done, &tb, None).await;
    assert_eq!(s["revealed"], true);
    // Alice (qui avait fini avant) est prévenue ; Bob (le dernier) non.
    let kinds = |u: Uuid| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, String>(
                "SELECT kind FROM notifications WHERE space_id = $1 AND user_id = $2
                   AND kind = 'eveningMenuRevealed'",
            )
            .bind(space)
            .bind(u)
            .fetch_all(&pool)
            .await
            .unwrap()
        }
    };
    assert_eq!(kinds(alice).await.len(), 1, "notification de dévoilement pour Alice");
    assert!(kinds(bob).await.is_empty());
    let (_, items_b) = req(&app, "GET", &list, &tb, None).await;
    assert_eq!(find(&items_b, a1)["matched"], true);
    let film = find(&items_b, a2);
    assert_eq!(film["picked"], false);
    assert_eq!(film["matched"], false);
    assert_eq!(film["partnerWants"], true, "le choix non matché d'Alice est dévoilé");
    let (_, items_a) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(find(&items_a, b2)["partnerWants"], true, "et réciproquement");

    // Définitif : plus de retrait de validation, plus de choix.
    let (st, _) = req(&app, "DELETE", &done, &tb, None).await;
    assert_eq!(st, StatusCode::CONFLICT);
    // Dévoilé : seules les idées de l'autre se valident (rien d'autre à choisir).
    let (st, _) = req(&app, "PUT", &format!("{list}/evening-passionate"), &tb, None).await;
    assert_eq!(st, StatusCode::CONFLICT);

    // Mode ouvert : pas de « J'ai fini » (tout est déjà visible).
    let (st, _) = req(&app, "PATCH", &patch, &ta, Some(json!({ "eveningMenuBlind": false }))).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = req(&app, "PUT", &done, &ta, None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

/// Menus dévoilés (mode aveugle) : on valide ou refuse les idées de l'autre ;
/// un match « validé ensemble » se distingue d'un match par coïncidence.
#[sqlx::test]
async fn menu_du_soir_apres_devoilement_valider_ou_refuser(pool: PgPool) {
    let (app, state) = build_app(pool.clone());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);
    let list = format!("/api/spaces/{space}/evening-menu");
    let done = format!("/api/spaces/{space}/evening-menu-done");
    let (st, _) = req(&app, "PATCH", &format!("/api/spaces/{space}"), &ta, Some(json!({ "eveningMenuEnabled": true }))).await;
    assert_eq!(st, StatusCode::OK);
    let find = |items: &serde_json::Value, code: &str| -> serde_json::Value {
        items.as_array().unwrap().iter().find(|i| i["code"] == code).unwrap().clone()
    };

    // Alice : massage (commun), film, câlins. Bob : massage (commun), jeu.
    let (common, a_film, a_cuddle, b_game) =
        ("evening-massage", "evening-movie", "evening-cuddle", "evening-game");
    for code in [common, a_film, a_cuddle] {
        req(&app, "PUT", &format!("{list}/{code}"), &ta, None).await;
    }
    for code in [common, b_game] {
        req(&app, "PUT", &format!("{list}/{code}"), &tb, None).await;
    }
    // Avant dévoilement : le refus reste indisponible en aveugle.
    let (st, _) = req(&app, "PUT", &format!("{list}/{a_film}"), &tb, Some(json!({ "stance": "refused" }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    req(&app, "PUT", &done, &ta, None).await;
    req(&app, "PUT", &done, &tb, None).await;

    // Le match d'origine est « par coïncidence », pas « validé ensemble ».
    let (_, items_b) = req(&app, "GET", &list, &tb, None).await;
    let m = find(&items_b, common);
    assert_eq!((m["matched"].clone(), m["agreed"].clone()), (json!(true), json!(false)));

    // Bob valide le film d'Alice → match « validé ensemble », des deux côtés.
    let (st, r) = req(&app, "PUT", &format!("{list}/{a_film}"), &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!((r["matched"].clone(), r["agreed"].clone(), r["responded"].clone()), (json!(true), json!(true), json!(true)));
    let (_, items_a) = req(&app, "GET", &list, &ta, None).await;
    let f = find(&items_a, a_film);
    assert_eq!((f["matched"].clone(), f["agreed"].clone()), (json!(true), json!(true)));

    // Bob se ravise : sa réponse tardive se retire (l'idée d'Alice reste proposée).
    let (st, r) = req(&app, "DELETE", &format!("{list}/{a_film}"), &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!((r["matched"].clone(), r["partnerWants"].clone()), (json!(false), json!(true)));

    // Bob refuse les câlins d'Alice : refusé pour les deux.
    let (st, r) = req(&app, "PUT", &format!("{list}/{a_cuddle}"), &tb, Some(json!({ "stance": "refused" }))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(r["refused"], true);
    let (_, items_a) = req(&app, "GET", &list, &ta, None).await;
    assert_eq!(find(&items_a, a_cuddle)["refused"], true);

    // Alice répond au jeu de Bob.
    let (st, r) = req(&app, "PUT", &format!("{list}/{b_game}"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(r["matched"], true);

    // Verrous : un item que l'autre n'a pas proposé, ou son menu d'origine → 409.
    let (st, _) = req(&app, "PUT", &format!("{list}/evening-newThing"), &tb, None).await;
    assert_eq!(st, StatusCode::CONFLICT);
    let (st, _) = req(&app, "PUT", &format!("{list}/evening-passionate"), &tb, None).await;
    assert_eq!(st, StatusCode::CONFLICT);
    let (st, _) = req(&app, "DELETE", &format!("{list}/{b_game}"), &tb, None).await;
    assert_eq!(st, StatusCode::CONFLICT, "le menu d'origine reste figé");
}
