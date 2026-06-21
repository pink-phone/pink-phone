use std::time::{Duration, Instant};

use axum::extract::{Query, State};
use axum::response::Redirect;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::issue_token;
use crate::error::{ApiError, ApiResult};
use crate::state::{AppState, LoginTicket, OidcFlow};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/config", get(auth_config))
        .route("/api/auth/oidc/login", get(login))
        .route("/api/auth/oidc/callback", get(callback))
        .route("/api/auth/oidc/exchange", post(exchange))
}

// ---------- /api/auth/config ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthConfig {
    password_enabled: bool,
    oidc_enabled: bool,
}

async fn auth_config(State(state): State<AppState>) -> Json<AuthConfig> {
    Json(AuthConfig {
        password_enabled: state.config.password_auth_enabled,
        oidc_enabled: state.config.oidc_enabled(),
    })
}

// ---------- Discovery ----------

#[derive(Deserialize)]
struct Discovery {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    jwks_uri: String,
}

async fn discover(state: &AppState) -> ApiResult<Discovery> {
    let url = format!(
        "{}/.well-known/openid-configuration",
        state.config.oidc_issuer.trim_end_matches('/')
    );
    let disc: Discovery = state
        .http
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    // Défense en profondeur (SEC-009 / OIDC Discovery §4.3) : l'issuer renvoyé par
    // la discovery doit correspondre à l'OIDC_ISSUER configuré, sinon une réponse
    // de discovery substituée pourrait imposer un issuer/JWKS attaquant.
    if disc.issuer.trim_end_matches('/')
        != state.config.oidc_issuer.trim_end_matches('/')
    {
        tracing::error!(
            configured = %state.config.oidc_issuer,
            discovered = %disc.issuer,
            "issuer OIDC de la discovery ≠ OIDC_ISSUER configuré"
        );
        return Err(ApiError::Unauthorized);
    }
    Ok(disc)
}

fn random_b64(len: usize) -> String {
    let mut bytes = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

// ---------- /api/auth/oidc/login ----------

async fn login(State(state): State<AppState>) -> ApiResult<Redirect> {
    if !state.config.oidc_enabled() {
        return Err(ApiError::NotFound);
    }
    let disc = discover(&state).await?;

    let csrf = random_b64(16);
    let nonce = random_b64(16);
    let verifier = random_b64(32);
    let challenge =
        URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    {
        let mut states = state.oidc_states.lock().unwrap();
        states.retain(|_, f| f.created.elapsed() < Duration::from_secs(600));
        states.insert(
            csrf.clone(),
            OidcFlow {
                nonce: nonce.clone(),
                pkce_verifier: verifier,
                created: Instant::now(),
            },
        );
    }

    let mut url = url::Url::parse(&disc.authorization_endpoint)
        .map_err(|_| ApiError::Internal)?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &state.config.oidc_client_id)
        .append_pair("redirect_uri", &state.config.oidc_redirect_uri)
        .append_pair("scope", "openid email profile")
        .append_pair("state", &csrf)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(Redirect::to(url.as_str()))
}

// ---------- /api/auth/oidc/callback ----------

#[derive(Deserialize)]
struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: String,
}

#[derive(Deserialize)]
struct IdClaims {
    sub: String,
    email: Option<String>,
    name: Option<String>,
    preferred_username: Option<String>,
    nonce: Option<String>,
}

async fn callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackParams>,
) -> Redirect {
    let front = state.config.oidc_post_login_redirect.clone();
    match callback_inner(&state, params).await {
        Ok(token) => {
            // Le JWT (30 j) ne transite PAS par l'URL (SEC-006) : on dépose un code
            // éphémère à usage unique, échangé ensuite contre le jeton via POST.
            let code = random_b64(24);
            {
                let mut tickets = state.oidc_tickets.lock().unwrap();
                tickets.retain(|_, t| t.created.elapsed() < Duration::from_secs(60));
                tickets.insert(
                    code.clone(),
                    LoginTicket {
                        token,
                        created: Instant::now(),
                    },
                );
            }
            Redirect::to(&format!("{front}#code={code}"))
        }
        Err(e) => {
            tracing::warn!(error = ?e, "échec du callback OIDC");
            Redirect::to(&format!("{front}#error=oidc"))
        }
    }
}

// ---------- /api/auth/oidc/exchange ----------

#[derive(Deserialize)]
struct ExchangeBody {
    code: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeResponse {
    token: String,
}

/// Échange le code éphémère du callback contre le JWT de session (usage unique).
async fn exchange(
    State(state): State<AppState>,
    Json(body): Json<ExchangeBody>,
) -> ApiResult<Json<ExchangeResponse>> {
    let ticket = {
        let mut tickets = state.oidc_tickets.lock().unwrap();
        tickets.retain(|_, t| t.created.elapsed() < Duration::from_secs(60));
        tickets.remove(&body.code)
    }
    .ok_or(ApiError::Unauthorized)?;
    Ok(Json(ExchangeResponse {
        token: ticket.token,
    }))
}

async fn callback_inner(
    state: &AppState,
    params: CallbackParams,
) -> ApiResult<String> {
    if !state.config.oidc_enabled() {
        return Err(ApiError::NotFound);
    }
    if let Some(err) = params.error {
        return Err(ApiError::BadRequest(format!("fournisseur: {err}")));
    }
    let code = params.code.ok_or(ApiError::BadRequest("code manquant".into()))?;
    let csrf = params.state.ok_or(ApiError::BadRequest("state manquant".into()))?;

    // Récupère (et consomme) le flux associé au state — protection CSRF.
    let flow = {
        let mut states = state.oidc_states.lock().unwrap();
        states.remove(&csrf)
    }
    .ok_or(ApiError::BadRequest("state inconnu ou expiré".into()))?;

    let disc = discover(state).await?;

    // Échange du code contre les tokens (client confidentiel + PKCE).
    let token: TokenResponse = state
        .http
        .post(&disc.token_endpoint)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", &state.config.oidc_redirect_uri),
            ("client_id", &state.config.oidc_client_id),
            ("client_secret", &state.config.oidc_client_secret),
            ("code_verifier", &flow.pkce_verifier),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    // Validation de l'id_token : signature (JWKS), iss, aud, exp, puis nonce.
    let header =
        decode_header(&token.id_token).map_err(|_| ApiError::Unauthorized)?;
    let kid = header.kid.ok_or(ApiError::Unauthorized)?;
    let jwks: JwkSet = state
        .http
        .get(&disc.jwks_uri)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let jwk = jwks.find(&kid).ok_or(ApiError::Unauthorized)?;
    let key = DecodingKey::from_jwk(jwk).map_err(|_| ApiError::Unauthorized)?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[&state.config.oidc_client_id]);
    // Issuer autoritatif issu de la discovery (évite tout écart de slash final
    // entre OIDC_ISSUER configuré et le claim `iss` du jeton).
    validation.set_issuer(&[disc.issuer.as_str()]);
    let claims = decode::<IdClaims>(&token.id_token, &key, &validation)
        .map_err(|_| ApiError::Unauthorized)?
        .claims;

    if claims.nonce.as_deref() != Some(flow.nonce.as_str()) {
        return Err(ApiError::Unauthorized);
    }

    // Résolution / création du compte.
    let email = claims
        .email
        .map(|e| e.trim().to_lowercase())
        .unwrap_or_else(|| format!("{}@oidc.local", claims.sub));
    let display = claims
        .name
        .or(claims.preferred_username)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            email.split('@').next().unwrap_or("Partenaire").to_string()
        });

    let user_id = upsert_oidc_user(state, &claims.sub, &email, &display).await?;
    issue_token(&state.config.jwt_secret, user_id)
}

/// Lie par `oidc_sub`, sinon par email (compte existant), sinon crée.
async fn upsert_oidc_user(
    state: &AppState,
    sub: &str,
    email: &str,
    display: &str,
) -> ApiResult<Uuid> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE oidc_sub = $1",
    )
    .bind(sub)
    .fetch_optional(&state.pool)
    .await?
    {
        return Ok(id);
    }

    if let Some(id) = sqlx::query_scalar::<_, Uuid>(
        "UPDATE users SET oidc_sub = $1 WHERE email = $2 RETURNING id",
    )
    .bind(sub)
    .bind(email)
    .fetch_optional(&state.pool)
    .await?
    {
        return Ok(id);
    }

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, display_name, oidc_sub)
         VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(email)
    .bind(display)
    .bind(sub)
    .fetch_one(&state.pool)
    .await?;
    Ok(id)
}
