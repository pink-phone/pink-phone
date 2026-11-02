//! Tests d'intégration des zones « externes », longtemps restées sous 20 % de
//! couverture parce que difficiles à isoler (backlog #92) :
//!
//! * **OIDC** — un *faux IdP* (serveur axum local : discovery, JWKS, token endpoint)
//!   signe de vrais `id_token` RS256 avec une clé de test ; on rejoue le flux
//!   complet Authorization Code + PKCE contre les vraies routes de l'API.
//! * **Web Push** — sélection des destinataires (`push_recipients`), réglages,
//!   abonnement/désabonnement, purge des endpoints SSRF. Aucun envoi réseau réel.
//! * **WebSocket** — handshake (JWT en query + `ensure_member`), diffusion filtrée
//!   (pas d'écho de ses propres mutations, pas de fuite inter-salons), plafond de
//!   connexions simultanées, contre un vrai listener TCP.
//!
//! Même garde que `tests_integration` : feature `integration` + Postgres jetable.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderMap, Request, StatusCode};
use axum::routing::{get, post};
use axum::{Form, Json, Router};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use futures_util::StreamExt;
use http_body_util::BodyExt;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use crate::config::Config;
use crate::state::{AppState, EventKind, OidcCache, OidcMeta};
use crate::tests_integration::{
    add_member, build_app_with, req, seed_space, seed_user, test_config, token_for,
};

// =====================================================================
// OIDC — faux fournisseur d'identité
// =====================================================================

/// Clé RSA 2048 **de test uniquement** (versionnée à dessein, ne protège rien).
const IDP_PRIVATE_KEY: &str = include_str!("test_idp_key.pem");
/// Module public correspondant (base64url), pour le JWKS servi par le faux IdP.
const IDP_JWK_N: &str = "ts2O3ouIAqR5AunCaqjLnkspWTALi7lbH_6cyLhOYgpDwbb5pWGLGJmnV5xN-Lr6Qk-w1epvQmtRWkKisKdiKBgSe9QmP6u5NNBslrHWBUhGFf1nfTcu0vrTMfLhCXvrA4Qhb0ne-_jiFQsqV2VaWmNK6SBqKXy8rUqwsfEhhOrJm2E34Ob-qsiCT7DLpS6dRWjsj1FCpYeQj8Z6dU0vQJkpNs7k3NNQBOWKDxM8ho3tc0HuS0LIRciwLmoyuaIJsl-DECxr5PnWjw5onFerhmABz3MF2q7Tvwwx7b4NmMOCHMNfWXDF2U2y9o4dUrge7lcKaEvuacK04aSW0y5_Uw";

const CLIENT_ID: &str = "pinkphone-client";
const CLIENT_SECRET: &str = "s3cret";
const FRONT: &str = "http://app.test/";

/// Autorisation en attente côté IdP : ce que le client a annoncé à `/authorize`.
struct Grant {
    code_challenge: String,
    /// Claims de l'`id_token` (fusionnés par-dessus les claims de base).
    claims: Value,
}

#[derive(Default)]
struct IdpState {
    grants: Mutex<HashMap<String, Grant>>,
    /// `issuer` annoncé par la discovery (≠ base ⇒ simule une discovery substituée).
    issuer_override: Mutex<Option<String>>,
    /// `kid` dans l'en-tête des id_token signés / dans le JWKS publié.
    sign_kid: Mutex<String>,
    jwks_kid: Mutex<String>,
    token_fail: AtomicBool,
    discovery_hits: AtomicUsize,
    jwks_hits: AtomicUsize,
    token_hits: AtomicUsize,
    base: Mutex<String>,
}

type Idp = Arc<IdpState>;

async fn idp_discovery(State(s): State<Idp>) -> Json<Value> {
    s.discovery_hits.fetch_add(1, Ordering::SeqCst);
    let base = s.base.lock().unwrap().clone();
    let issuer = s
        .issuer_override
        .lock()
        .unwrap()
        .clone()
        .unwrap_or(base.clone());
    Json(json!({
        "issuer": issuer,
        "authorization_endpoint": format!("{base}/authorize"),
        "token_endpoint": format!("{base}/token"),
        "jwks_uri": format!("{base}/jwks"),
    }))
}

async fn idp_jwks(State(s): State<Idp>) -> Json<Value> {
    s.jwks_hits.fetch_add(1, Ordering::SeqCst);
    let kid = s.jwks_kid.lock().unwrap().clone();
    Json(json!({"keys": [{
        "kty": "RSA", "use": "sig", "alg": "RS256", "kid": kid,
        "n": IDP_JWK_N, "e": "AQAB",
    }]}))
}

/// Token endpoint : exige le secret client et un `code_verifier` cohérent avec le
/// `code_challenge` annoncé (vérifie donc réellement PKCE S256), puis signe l'id_token.
async fn idp_token(
    State(s): State<Idp>,
    Form(f): Form<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    s.token_hits.fetch_add(1, Ordering::SeqCst);
    if s.token_fail.load(Ordering::SeqCst) {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    if f.get("client_secret").map(String::as_str) != Some(CLIENT_SECRET)
        || f.get("grant_type").map(String::as_str) != Some("authorization_code")
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let grant = s
        .grants
        .lock()
        .unwrap()
        .remove(f.get("code").map(String::as_str).unwrap_or_default())
        .ok_or(StatusCode::BAD_REQUEST)?;
    let verifier = f.get("code_verifier").ok_or(StatusCode::BAD_REQUEST)?;
    if URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())) != grant.code_challenge {
        return Err(StatusCode::BAD_REQUEST);
    }

    let base = s.base.lock().unwrap().clone();
    let now = chrono::Utc::now().timestamp();
    let mut claims = json!({
        "iss": base, "aud": CLIENT_ID, "iat": now, "exp": now + 3600,
    });
    for (k, v) in grant.claims.as_object().unwrap() {
        claims[k] = v.clone();
    }
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(s.sign_kid.lock().unwrap().clone());
    let key = EncodingKey::from_rsa_pem(IDP_PRIVATE_KEY.as_bytes()).unwrap();
    let id_token = encode(&header, &claims, &key).unwrap();
    Ok(Json(
        json!({ "id_token": id_token, "token_type": "Bearer" }),
    ))
}

/// Lance le faux IdP sur un port libre ; renvoie son URL de base et son état.
async fn spawn_idp() -> (String, Idp) {
    let state: Idp = Arc::new(IdpState::default());
    *state.sign_kid.lock().unwrap() = "k1".into();
    *state.jwks_kid.lock().unwrap() = "k1".into();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    *state.base.lock().unwrap() = base.clone();
    let app = Router::new()
        .route("/.well-known/openid-configuration", get(idp_discovery))
        .route("/jwks", get(idp_jwks))
        .route("/token", post(idp_token))
        .with_state(state.clone());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (base, state)
}

fn oidc_config(issuer: &str) -> Config {
    Config {
        oidc_issuer: issuer.to_string(),
        oidc_client_id: CLIENT_ID.into(),
        oidc_client_secret: CLIENT_SECRET.into(),
        oidc_redirect_uri: "http://app.test/api/auth/oidc/callback".into(),
        oidc_post_login_redirect: FRONT.into(),
        ..test_config()
    }
}

/// Requête brute sans authentification (le flux OIDC est public).
async fn raw(
    app: &Router,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, HeaderMap, Vec<u8>) {
    let mut b = Request::builder()
        .method(method)
        .uri(path)
        .header("x-real-ip", "127.0.0.1");
    let body = match body {
        Some(j) => {
            b = b.header(header::CONTENT_TYPE, "application/json");
            Body::from(j.to_string())
        }
        None => Body::empty(),
    };
    let resp = app.clone().oneshot(b.body(body).unwrap()).await.unwrap();
    let (st, headers) = (resp.status(), resp.headers().clone());
    let bytes = resp
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    (st, headers, bytes)
}

fn location(h: &HeaderMap) -> String {
    h.get(header::LOCATION)
        .unwrap()
        .to_str()
        .unwrap()
        .to_string()
}

/// `GET /login` → (state anti-CSRF, nonce, code_challenge) lus dans la redirection.
async fn start_login(app: &Router) -> (String, String, String) {
    let (st, h, _) = raw(app, "GET", "/api/auth/oidc/login", None).await;
    assert_eq!(st, StatusCode::SEE_OTHER);
    let url = url::Url::parse(&location(&h)).unwrap();
    let q: HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(q["response_type"], "code");
    assert_eq!(q["client_id"], CLIENT_ID);
    assert_eq!(q["code_challenge_method"], "S256");
    assert!(q["scope"].contains("openid"));
    (
        q["state"].clone(),
        q["nonce"].clone(),
        q["code_challenge"].clone(),
    )
}

/// Déroule login → (IdP enregistre le grant) → callback ; renvoie la redirection finale.
async fn login_flow(app: &Router, idp: &Idp, code: &str, extra: Value) -> String {
    let (state, nonce, challenge) = start_login(app).await;
    let mut claims = json!({ "nonce": nonce });
    for (k, v) in extra.as_object().unwrap() {
        claims[k] = v.clone();
    }
    idp.grants.lock().unwrap().insert(
        code.to_string(),
        Grant {
            code_challenge: challenge,
            claims,
        },
    );
    let (st, h, _) = raw(
        app,
        "GET",
        &format!("/api/auth/oidc/callback?code={code}&state={state}"),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::SEE_OTHER);
    location(&h)
}

/// Extrait le code éphémère `#code=…` de la redirection de succès.
fn ticket_code(redirect: &str) -> String {
    redirect
        .strip_prefix(&format!("{FRONT}#code="))
        .unwrap_or_else(|| panic!("redirection de succès attendue, reçu {redirect}"))
        .to_string()
}

async fn exchange(app: &Router, code: &str) -> (StatusCode, Value) {
    let (st, _, body) = raw(
        app,
        "POST",
        "/api/auth/oidc/exchange",
        Some(json!({ "code": code })),
    )
    .await;
    (st, serde_json::from_slice(&body).unwrap_or(Value::Null))
}

async fn me_id(app: &Router, token: &str) -> Uuid {
    let (st, me) = req(app, "GET", "/api/auth/me", token, None).await;
    assert_eq!(st, StatusCode::OK);
    me["id"].as_str().unwrap().parse().unwrap()
}

#[sqlx::test]
async fn oidc_desactive_login_404_et_config_le_dit(pool: PgPool) {
    let (app, _) = build_app_with(pool, test_config());
    let (st, _, _) = raw(&app, "GET", "/api/auth/oidc/login", None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _, _) = raw(&app, "GET", "/api/auth/oidc/callback?code=x&state=y", None).await;
    assert_eq!(st, StatusCode::SEE_OTHER); // erreur renvoyée au front, jamais de 5xx
    let (_, _, body) = raw(&app, "GET", "/api/auth/config", None).await;
    let cfg: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(cfg["oidcEnabled"], false);
    assert_eq!(cfg["passwordEnabled"], true);
}

#[sqlx::test]
async fn oidc_flux_complet_cree_le_compte_et_le_code_est_a_usage_unique(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, _) = build_app_with(pool.clone(), oidc_config(&base));
    let (_, _, body) = raw(&app, "GET", "/api/auth/config", None).await;
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap()["oidcEnabled"],
        true
    );

    let redirect = login_flow(
        &app,
        &idp,
        "code-1",
        json!({"sub": "sub-alice", "email": "Alice@Example.com", "email_verified": true,
               "name": "Alice"}),
    )
    .await;
    let code = ticket_code(&redirect);
    let (st, body) = exchange(&app, &code).await;
    assert_eq!(st, StatusCode::OK);
    let token = body["token"].as_str().unwrap().to_string();

    // Le jeton ouvre une vraie session sur le compte créé (email normalisé).
    let (st, me) = req(&app, "GET", "/api/auth/me", &token, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(me["email"], "alice@example.com");
    assert_eq!(me["displayName"], "Alice");
    let sub: String = sqlx::query_scalar("SELECT oidc_sub FROM users WHERE email = $1")
        .bind("alice@example.com")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sub, "sub-alice");

    // Code éphémère à usage unique (SEC-006).
    let (st, _) = exchange(&app, &code).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, _) = exchange(&app, "inconnu").await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);

    // Reconnexion : même `sub` ⇒ même compte (pas de doublon).
    let again = login_flow(
        &app,
        &idp,
        "code-2",
        json!({"sub": "sub-alice", "email": "alice@example.com", "email_verified": true}),
    )
    .await;
    let (_, body) = exchange(&app, &ticket_code(&again)).await;
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
    assert_eq!(
        me_id(&app, body["token"].as_str().unwrap()).await,
        me_id(&app, &token).await
    );
}

#[sqlx::test]
async fn oidc_email_verifie_lie_le_compte_existant_non_verifie_jamais(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, _) = build_app_with(pool.clone(), oidc_config(&base));
    let victime = seed_user(&pool, "victime").await; // victime@test.local

    // Email NON vérifié : aucune prise de contrôle (SECURITY_FINDINGS.md #9).
    let r = login_flow(
        &app,
        &idp,
        "c-unverified",
        json!({"sub": "sub-pirate", "email": "victime@test.local", "email_verified": false}),
    )
    .await;
    let (_, body) = exchange(&app, &ticket_code(&r)).await;
    let pirate = me_id(&app, body["token"].as_str().unwrap()).await;
    assert_ne!(pirate, victime);
    let email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(pirate)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(email, "sub-pirate@oidc.local");

    // Email vérifié : le compte existant est lié au `sub`.
    let r = login_flow(
        &app,
        &idp,
        "c-verified",
        json!({"sub": "sub-legit", "email": "victime@test.local", "email_verified": true}),
    )
    .await;
    let (_, body) = exchange(&app, &ticket_code(&r)).await;
    assert_eq!(me_id(&app, body["token"].as_str().unwrap()).await, victime);
    let sub: String = sqlx::query_scalar("SELECT oidc_sub FROM users WHERE id = $1")
        .bind(victime)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sub, "sub-legit");
}

#[sqlx::test]
async fn oidc_nom_affiche_replis_name_username_puis_email(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, _) = build_app_with(pool.clone(), oidc_config(&base));
    for (i, (extra, attendu)) in [
        (json!({"sub": "s1", "preferred_username": "bobby"}), "bobby"),
        (json!({"sub": "s2", "name": "  "}), "s2"), // vide ⇒ repli sur la partie locale de l'email
    ]
    .into_iter()
    .enumerate()
    {
        let r = login_flow(&app, &idp, &format!("c{i}"), extra).await;
        let (_, body) = exchange(&app, &ticket_code(&r)).await;
        let (_, me) = req(
            &app,
            "GET",
            "/api/auth/me",
            body["token"].as_str().unwrap(),
            None,
        )
        .await;
        assert_eq!(me["displayName"], attendu);
    }
}

#[sqlx::test]
async fn oidc_callback_refuse_state_inconnu_rejoue_ou_erreur_fournisseur(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, _) = build_app_with(pool, oidc_config(&base));
    let err = format!("{FRONT}#error=oidc");

    // state inconnu.
    let (_, h, _) = raw(
        &app,
        "GET",
        "/api/auth/oidc/callback?code=c&state=nope",
        None,
    )
    .await;
    assert_eq!(location(&h), err);
    // paramètres manquants.
    let (state, nonce, challenge) = start_login(&app).await;
    let (_, h, _) = raw(
        &app,
        "GET",
        &format!("/api/auth/oidc/callback?state={state}"),
        None,
    )
    .await;
    assert_eq!(location(&h), err); // code manquant (et le state est consommé)
    let (_, h, _) = raw(&app, "GET", "/api/auth/oidc/callback?code=c", None).await;
    assert_eq!(location(&h), err); // state manquant
                                   // erreur remontée par le fournisseur.
    let (_, h, _) = raw(
        &app,
        "GET",
        "/api/auth/oidc/callback?error=access_denied",
        None,
    )
    .await;
    assert_eq!(location(&h), err);

    // state à usage unique : un callback valide ne peut pas être rejoué.
    let (state, nonce2, challenge2) = start_login(&app).await;
    let _ = (nonce, challenge);
    idp.grants.lock().unwrap().insert(
        "ok".into(),
        Grant {
            code_challenge: challenge2,
            claims: json!({"nonce": nonce2, "sub": "s-replay"}),
        },
    );
    let path = format!("/api/auth/oidc/callback?code=ok&state={state}");
    let (_, h, _) = raw(&app, "GET", &path, None).await;
    assert!(location(&h).contains("#code="));
    let (_, h, _) = raw(&app, "GET", &path, None).await;
    assert_eq!(location(&h), err);
}

#[sqlx::test]
async fn oidc_callback_refuse_nonce_audience_et_issuer_incorrects(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, _) = build_app_with(pool, oidc_config(&base));
    let err = format!("{FRONT}#error=oidc");
    for (code, extra) in [
        ("bad-nonce", json!({"sub": "s", "nonce": "autre-nonce"})),
        ("bad-aud", json!({"sub": "s", "aud": "un-autre-client"})),
        (
            "bad-iss",
            json!({"sub": "s", "iss": "https://evil.example.com"}),
        ),
        ("expired", json!({"sub": "s", "exp": 1_000_000_000})),
        ("no-nonce", json!({"sub": "s", "nonce": null})),
    ] {
        let r = login_flow(&app, &idp, code, extra).await;
        assert_eq!(r, err, "{code} doit être refusé");
    }
}

#[sqlx::test]
async fn oidc_refuse_pkce_verifier_incoherent_et_token_endpoint_en_panne(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, _) = build_app_with(pool, oidc_config(&base));
    let err = format!("{FRONT}#error=oidc");

    // Le faux IdP renvoie 400 si le verifier ne correspond pas au challenge : on
    // lui annonce un autre challenge, donc le code_verifier du serveur est rejeté.
    let (state, nonce, _) = start_login(&app).await;
    idp.grants.lock().unwrap().insert(
        "pkce".into(),
        Grant {
            code_challenge: "pas-le-bon".into(),
            claims: json!({"nonce": nonce, "sub": "s"}),
        },
    );
    let (_, h, _) = raw(
        &app,
        "GET",
        &format!("/api/auth/oidc/callback?code=pkce&state={state}"),
        None,
    )
    .await;
    assert_eq!(location(&h), err);

    // Token endpoint en erreur 5xx.
    idp.token_fail.store(true, Ordering::SeqCst);
    let r = login_flow(&app, &idp, "down", json!({"sub": "s"})).await;
    assert_eq!(r, err);
    assert!(idp.token_hits.load(Ordering::SeqCst) >= 2);
}

#[sqlx::test]
async fn oidc_discovery_avec_issuer_substitue_refusee(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    *idp.issuer_override.lock().unwrap() = Some("https://evil.example.com".into());
    let (app, _) = build_app_with(pool, oidc_config(&base));
    let (st, _, _) = raw(&app, "GET", "/api/auth/oidc/login", None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED); // SEC-009 : issuer ≠ OIDC_ISSUER configuré
}

#[sqlx::test]
async fn oidc_discovery_injoignable_donne_une_erreur_pas_une_panique(pool: PgPool) {
    // Port fermé : on réserve un port libre puis on le relâche.
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", l.local_addr().unwrap());
    drop(l);
    let (app, _) = build_app_with(pool, oidc_config(&base));
    let (st, _, _) = raw(&app, "GET", "/api/auth/oidc/login", None).await;
    assert!(st.is_server_error(), "reçu {st}");
}

#[sqlx::test]
async fn oidc_discovery_et_jwks_servis_du_cache_puis_refetch_si_kid_inconnu(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, state) = build_app_with(pool, oidc_config(&base));

    // Deux logins : la discovery n'est interrogée qu'une fois (RUST-04).
    start_login(&app).await;
    start_login(&app).await;
    assert_eq!(idp.discovery_hits.load(Ordering::SeqCst), 1);
    assert_eq!(idp.jwks_hits.load(Ordering::SeqCst), 1);

    // Rotation de clé : le cache ne connaît que l'ancienne clé, l'IdP signe avec une
    // nouvelle → le callback force un refetch immédiat du JWKS et réussit.
    *idp.sign_kid.lock().unwrap() = "k2".into();
    *idp.jwks_kid.lock().unwrap() = "k2".into();
    {
        let mut cache = state.oidc_cache.lock().unwrap();
        let old = cache.as_mut().unwrap();
        old.jwks = serde_json::from_value(json!({"keys": [{
            "kty": "RSA", "use": "sig", "alg": "RS256", "kid": "k1",
            "n": IDP_JWK_N, "e": "AQAB",
        }]}))
        .unwrap();
    }
    let hits_avant = idp.jwks_hits.load(Ordering::SeqCst);
    let r = login_flow(&app, &idp, "rot", json!({"sub": "sub-rot"})).await;
    assert!(r.contains("#code="), "reçu {r}");
    assert_eq!(idp.jwks_hits.load(Ordering::SeqCst), hits_avant + 1);
    let kids: Vec<_> = state
        .oidc_cache
        .lock()
        .unwrap()
        .as_ref()
        .unwrap()
        .jwks
        .keys
        .iter()
        .map(|k| k.common.key_id.clone().unwrap())
        .collect();
    assert_eq!(kids, vec!["k2".to_string()]);
}

#[sqlx::test]
async fn oidc_kid_introuvable_meme_apres_refetch_refuse(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    *idp.sign_kid.lock().unwrap() = "fantome".into(); // le JWKS publie k1 seulement
    let (app, _) = build_app_with(pool, oidc_config(&base));
    let r = login_flow(&app, &idp, "ghost", json!({"sub": "s"})).await;
    assert_eq!(r, format!("{FRONT}#error=oidc"));
}

#[sqlx::test]
async fn oidc_cache_expire_est_rafraichi(pool: PgPool) {
    let (base, idp) = spawn_idp().await;
    let (app, state) = build_app_with(pool, oidc_config(&base));
    *state.oidc_cache.lock().unwrap() = Some(OidcCache {
        meta: OidcMeta {
            issuer: base.clone(),
            authorization_endpoint: format!("{base}/authorize"),
            token_endpoint: format!("{base}/token"),
        },
        jwks: serde_json::from_value(json!({"keys": []})).unwrap(),
        // Plus vieux que le TTL d'1 h.
        fetched: Instant::now() - Duration::from_secs(3601),
    });
    start_login(&app).await;
    assert_eq!(idp.discovery_hits.load(Ordering::SeqCst), 1);
}

// =====================================================================
// Web Push
// =====================================================================

const VAPID_TEST_KEY: &str = "IQ9Ur0ykXoHS9gzfYX0aBjy9lvdrjx_PFUXmie9YRcY";

async fn seed_push_sub(pool: &PgPool, user: Uuid, endpoint: &str) {
    sqlx::query(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, 'p', 'a')",
    )
    .bind(user)
    .bind(endpoint)
    .execute(pool)
    .await
    .unwrap();
}

async fn set_mode(pool: &PgPool, user: Uuid, mode: &str) {
    sqlx::query("INSERT INTO user_settings (user_id, notif_mode) VALUES ($1, $2)")
        .bind(user)
        .bind(mode)
        .execute(pool)
        .await
        .unwrap();
}

#[sqlx::test]
async fn push_destinataires_autres_membres_en_mode_push_uniquement(pool: PgPool) {
    let alice = seed_user(&pool, "alice").await; // l'acteur
    let bob = seed_user(&pool, "bob").await; // push
    let carol = seed_user(&pool, "carol").await; // digest
    let dave = seed_user(&pool, "dave").await; // aucun réglage ⇒ ghost
    let eve = seed_user(&pool, "eve").await; // push mais PAS membre
    let space = seed_space(&pool, alice).await;
    for u in [bob, carol, dave] {
        add_member(&pool, u, space).await;
    }
    set_mode(&pool, alice, "push").await;
    set_mode(&pool, bob, "push").await;
    set_mode(&pool, carol, "digest").await;
    set_mode(&pool, eve, "push").await;
    for (u, e) in [
        (alice, "https://push.example/alice"),
        (bob, "https://push.example/bob"),
        (carol, "https://push.example/carol"),
        (dave, "https://push.example/dave"),
        (eve, "https://push.example/eve"),
    ] {
        seed_push_sub(&pool, u, e).await;
    }

    let r = crate::notifications::push_recipients(&pool, space, alice)
        .await
        .unwrap();
    let endpoints: Vec<_> = r.iter().map(|s| s.endpoint.as_str()).collect();
    // Ni l'acteur (alice), ni digest/ghost, ni un non-membre.
    assert_eq!(endpoints, vec!["https://push.example/bob"]);
}

#[sqlx::test]
async fn push_reglages_defaut_ghost_validation_et_cle_vapid(pool: PgPool) {
    let cfg = Config {
        vapid_public_key: "PUB".into(),
        ..test_config()
    };
    let (app, state) = build_app_with(pool.clone(), cfg);
    let u = seed_user(&pool, "alice").await;
    let t = token_for(&state, u);

    let (st, s) = req(&app, "GET", "/api/me/settings", &t, None).await;
    assert_eq!(
        (st, s["notifMode"].as_str()),
        (StatusCode::OK, Some("ghost"))
    );
    let (st, s) = req(
        &app,
        "PUT",
        "/api/me/settings",
        &t,
        Some(json!({"notifMode": "push"})),
    )
    .await;
    assert_eq!(
        (st, s["notifMode"].as_str()),
        (StatusCode::OK, Some("push"))
    );
    let (_, s) = req(&app, "GET", "/api/me/settings", &t, None).await;
    assert_eq!(s["notifMode"], "push");
    // Idempotent / mise à jour.
    let (st, _) = req(
        &app,
        "PUT",
        "/api/me/settings",
        &t,
        Some(json!({"notifMode": "digest"})),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = req(
        &app,
        "PUT",
        "/api/me/settings",
        &t,
        Some(json!({"notifMode": "spam"})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, v) = req(&app, "GET", "/api/notifications/vapid", &t, None).await;
    assert_eq!((st, v["publicKey"].as_str()), (StatusCode::OK, Some("PUB")));
}

#[sqlx::test]
async fn push_abonnement_refuse_les_endpoints_ssrf_et_gere_upsert_desabonnement(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let sub = |endpoint: &str| json!({"endpoint": endpoint, "keys": {"p256dh": "P", "auth": "A"}});

    // SSRF (SECURITY_FINDINGS.md #11) : http, IP privée, métadonnées cloud, non-URL.
    for bad in [
        "http://8.8.8.8/push",
        "https://127.0.0.1/push",
        "https://169.254.169.254/latest/meta-data/",
        "pas-une-url",
    ] {
        let (st, _) = req(&app, "POST", "/api/me/push", &ta, Some(sub(bad))).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{bad}");
    }
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);

    // Abonnement valide (IP publique littérale : pas de DNS dans le test).
    let ep = "https://8.8.8.8/push/abc";
    let (st, _) = req(&app, "POST", "/api/me/push", &ta, Some(sub(ep))).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    // Ré-abonnement du même endpoint par un autre compte : upsert, pas de doublon.
    let (st, _) = req(&app, "POST", "/api/me/push", &tb, Some(sub(ep))).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let owner: Uuid = sqlx::query_scalar("SELECT user_id FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(owner, bob);

    // Désabonnement : ne supprime que SES propres abonnements.
    let url = format!("/api/me/push?endpoint={}", urlencode(ep));
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1, "alice ne possède pas cet abonnement");
    let (st, _) = req(&app, "DELETE", &url, &tb, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

fn urlencode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

#[sqlx::test]
async fn push_notify_members_sans_vapid_ne_fait_rien(pool: PgPool) {
    let (_, state) = build_app_with(pool.clone(), test_config()); // VAPID vide
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    set_mode(&pool, bob, "push").await;
    seed_push_sub(&pool, bob, "https://127.0.0.1/ignore").await;

    crate::notifications::notify_members(&state, space, alice, "post", None, None, "post".into())
        .await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    // VAPID absent ⇒ envoi ignoré : l'abonnement n'est même pas examiné.
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[sqlx::test]
async fn push_notify_members_purge_un_endpoint_ssrf_a_l_envoi(pool: PgPool) {
    let cfg = Config {
        vapid_private_key: VAPID_TEST_KEY.into(),
        vapid_subject: "mailto:test@example.com".into(),
        ..test_config()
    };
    let (_, state) = build_app_with(pool.clone(), cfg);
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    set_mode(&pool, bob, "push").await;
    // Inséré directement (contourne `subscribe`) : simule un endpoint devenu interne
    // après coup (DNS rebinding) ; la revalidation à l'envoi doit le purger sans
    // JAMAIS émettre de requête vers 127.0.0.1.
    seed_push_sub(&pool, bob, "https://127.0.0.1/interne").await;

    crate::notifications::notify_members(&state, space, alice, "post", None, None, "post".into())
        .await;

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
            .fetch_one(&pool)
            .await
            .unwrap();
        if n == 0 {
            break;
        }
        assert!(Instant::now() < deadline, "endpoint SSRF non purgé");
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

// =====================================================================
// WebSocket
// =====================================================================

type Ws =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn serve(app: Router) -> SocketAddr {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
    });
    addr
}

/// Ouvre la WebSocket ; `Err(statut)` si le handshake est refusé.
async fn ws_connect(addr: SocketAddr, space: Uuid, token: &str) -> Result<Ws, StatusCode> {
    let url = format!("ws://{addr}/api/spaces/{space}/ws?token={token}");
    match tokio_tungstenite::connect_async(url).await {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(resp)) => Err(resp.status()),
        Err(e) => panic!("erreur de connexion inattendue : {e}"),
    }
}

/// Prochain message texte JSON (None si rien dans le délai).
async fn next_event(ws: &mut Ws, wait: Duration) -> Option<Value> {
    use tokio_tungstenite::tungstenite::Message;
    loop {
        match tokio::time::timeout(wait, ws.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => {
                return Some(serde_json::from_str(t.as_str()).unwrap())
            }
            Ok(Some(Ok(_))) => continue,
            _ => return None,
        }
    }
}

/// Émet `kind` (acteur `actor`) en boucle jusqu'à ce que `ws` le reçoive : garantit
/// que l'abonnement serveur au bus est actif avant de poursuivre (sinon l'événement
/// émis juste après le handshake pourrait se perdre).
async fn sync_subscribed(state: &AppState, ws: &mut Ws, space: Uuid, actor: Uuid) {
    for _ in 0..100 {
        state.emit(space, actor, EventKind::Post);
        if next_event(ws, Duration::from_millis(50)).await.is_some() {
            return;
        }
    }
    panic!("la WebSocket n'a jamais reçu d'événement");
}

#[sqlx::test]
async fn ws_handshake_refuse_jeton_invalide_et_non_membre(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let mallory = seed_user(&pool, "mallory").await;
    let space = seed_space(&pool, alice).await;
    let addr = serve(app).await;

    assert_eq!(
        ws_connect(addr, space, "n-importe-quoi").await.err(),
        Some(StatusCode::UNAUTHORIZED)
    );
    // Jeton valide mais pas membre du salon ⇒ 403 (isolation multi-salon).
    let tm = token_for(&state, mallory);
    assert_eq!(
        ws_connect(addr, space, &tm).await.err(),
        Some(StatusCode::FORBIDDEN)
    );
    // Membre : accepté.
    let ta = token_for(&state, alice);
    assert!(ws_connect(addr, space, &ta).await.is_ok());
}

#[sqlx::test]
async fn ws_diffuse_aux_autres_membres_sans_echo_ni_fuite_inter_salons(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let autre_salon = seed_space(&pool, bob).await;
    let addr = serve(app).await;

    let mut ws = ws_connect(addr, space, &token_for(&state, alice))
        .await
        .unwrap();
    sync_subscribed(&state, &mut ws, space, bob).await;
    // Laisse se vider les éventuels doublons du préambule de synchro.
    while next_event(&mut ws, Duration::from_millis(150))
        .await
        .is_some()
    {}

    state.emit(space, alice, EventKind::Mood); // sa propre mutation : pas d'écho
    state.emit(autre_salon, bob, EventKind::Mood); // autre salon : jamais reçu
    state.emit(space, bob, EventKind::Comment); // partenaire, même salon : reçu

    let ev = next_event(&mut ws, Duration::from_secs(5))
        .await
        .expect("événement attendu");
    assert_eq!(ev["kind"], "comment");
    assert_eq!(ev["spaceId"], space.to_string());
    assert_eq!(ev["actorId"], bob.to_string());
    assert!(next_event(&mut ws, Duration::from_millis(300))
        .await
        .is_none());
}

#[sqlx::test]
async fn ws_plafond_de_connexions_simultanees_par_utilisateur_et_liberation(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let addr = serve(app).await;
    let t = token_for(&state, alice);

    let mut ouvertes = Vec::new();
    for _ in 0..10 {
        ouvertes.push(ws_connect(addr, space, &t).await.unwrap());
    }
    // La 11e dépasse le plafond (SECURITY_FINDINGS.md #15).
    assert_eq!(
        ws_connect(addr, space, &t).await.err(),
        Some(StatusCode::TOO_MANY_REQUESTS)
    );

    // Fermer une connexion libère sa place (compteur décrémenté au Drop).
    let mut une = ouvertes.pop().unwrap();
    une.close(None).await.unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(2), une.next()).await;
    let mut ok = false;
    for _ in 0..5 {
        tokio::time::sleep(Duration::from_millis(300)).await;
        if ws_connect(addr, space, &t).await.is_ok() {
            ok = true;
            break;
        }
    }
    assert!(ok, "la place libérée n'a jamais été récupérée");
}

#[sqlx::test]
async fn ws_limite_le_debit_des_tentatives_d_ouverture(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let addr = serve(app).await;
    let t = token_for(&state, alice);

    // 20 tentatives/min : au-delà, 429 quoi qu'il arrive (débit ou simultanéité).
    let mut statuts = Vec::new();
    for _ in 0..24 {
        match ws_connect(addr, space, &t).await {
            Ok(mut ws) => {
                let _ = ws.close(None).await;
                statuts.push(StatusCode::SWITCHING_PROTOCOLS);
            }
            Err(st) => statuts.push(st),
        }
    }
    assert!(statuts
        .iter()
        .all(|s| *s == StatusCode::SWITCHING_PROTOCOLS || *s == StatusCode::TOO_MANY_REQUESTS));
    assert_eq!(statuts[23], StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn ws_survit_au_retard_de_lecture_et_ignore_les_trames_du_client(pool: PgPool) {
    use futures_util::SinkExt;
    use tokio_tungstenite::tungstenite::Message;
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let addr = serve(app).await;

    let mut ws = ws_connect(addr, space, &token_for(&state, alice))
        .await
        .unwrap();
    sync_subscribed(&state, &mut ws, space, bob).await;
    while next_event(&mut ws, Duration::from_millis(150))
        .await
        .is_some()
    {}

    // Le client envoie du texte/ping : ignorés, la connexion reste ouverte.
    ws.send(Message::Text("coucou".into())).await.unwrap();
    ws.send(Message::Ping(Vec::new().into())).await.unwrap();

    // Plus d'événements que la capacité du bus (256) émis d'un coup, sans que le
    // serveur ait le temps de les consommer : le récepteur « Lagged » saute les
    // manquants et continue (best-effort, le client resynchronise de toute façon).
    for _ in 0..600 {
        state.emit(space, bob, EventKind::Seen);
    }
    state.emit(space, bob, EventKind::Comment);
    let mut vu_commentaire = false;
    while let Some(ev) = next_event(&mut ws, Duration::from_secs(3)).await {
        if ev["kind"] == "comment" {
            vu_commentaire = true;
            break;
        }
    }
    assert!(
        vu_commentaire,
        "la connexion doit survivre au retard et livrer la suite"
    );

    // Fermeture propre côté client : le serveur libère sa place.
    ws.close(None).await.unwrap();
}
