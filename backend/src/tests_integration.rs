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
