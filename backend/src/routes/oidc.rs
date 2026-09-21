use std::time::{Duration, Instant};

use axum::extract::{Query, State};
use axum::response::Redirect;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::issue_token;
use crate::error::{ApiError, ApiResult};
use crate::state::{AppState, LoginTicket, OidcCache, OidcFlow, OidcMeta};

/// Durée de vie du cache discovery/JWKS (RUST-04).
const OIDC_CACHE_TTL: Duration = Duration::from_secs(3600);

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

/// Récupère discovery + JWKS depuis le provider (sans cache) et valide l'issuer.
async fn fetch_oidc_metadata(state: &AppState) -> ApiResult<(OidcMeta, JwkSet)> {
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
    let jwks: JwkSet = state
        .http
        .get(&disc.jwks_uri)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let meta = OidcMeta {
        issuer: disc.issuer,
        authorization_endpoint: disc.authorization_endpoint,
        token_endpoint: disc.token_endpoint,
    };
    Ok((meta, jwks))
}

/// Discovery + JWKS, servis depuis le cache s'il est encore frais (RUST-04),
/// sinon refetch + mise en cache. Verrou std relâché autour de chaque `await`.
async fn oidc_metadata(state: &AppState) -> ApiResult<(OidcMeta, JwkSet)> {
    {
        let cache = state.oidc_cache.lock().unwrap();
        if let Some(c) = cache.as_ref() {
            if c.fetched.elapsed() < OIDC_CACHE_TTL {
                return Ok((c.meta.clone(), c.jwks.clone()));
            }
        }
    }
    let (meta, jwks) = fetch_oidc_metadata(state).await?;
    store_oidc_cache(state, &meta, &jwks);
    Ok((meta, jwks))
}

fn store_oidc_cache(state: &AppState, meta: &OidcMeta, jwks: &JwkSet) {
    let mut cache = state.oidc_cache.lock().unwrap();
    *cache = Some(OidcCache {
        meta: meta.clone(),
        jwks: jwks.clone(),
        fetched: Instant::now(),
    });
}

fn random_b64(len: usize) -> String {
    let mut bytes = vec![0u8; len];
    rand::fill(&mut bytes[..]);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// `code_challenge` PKCE (méthode S256, RFC 7636 §4.2).
fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

// ---------- /api/auth/oidc/login ----------

async fn login(State(state): State<AppState>) -> ApiResult<Redirect> {
    if !state.config.oidc_enabled() {
        return Err(ApiError::NotFound);
    }
    let (meta, _) = oidc_metadata(&state).await?;

    let csrf = random_b64(16);
    let nonce = random_b64(16);
    let verifier = random_b64(32);
    let challenge = pkce_challenge(&verifier);

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

    let mut url = url::Url::parse(&meta.authorization_endpoint)
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
    /// Le fournisseur atteste avoir vérifié cette adresse (lien cliqué, OTP…).
    /// SECURITY_FINDINGS.md #9 : sans ce contrôle, `upsert_oidc_user` lie/à un
    /// compte EXISTANT par email — un fournisseur qui n'exige pas de vérification
    /// d'email laisserait n'importe qui revendiquer l'email de quelqu'un d'autre
    /// et prendre le contrôle de son compte PinkPhone existant (CWE-345). Absent
    /// du claim (`None`) ⇒ traité comme non vérifié, jamais comme vérifié par défaut.
    email_verified: Option<bool>,
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

    let (meta, jwks) = oidc_metadata(state).await?;

    // Échange du code contre les tokens (client confidentiel + PKCE).
    let token: TokenResponse = state
        .http
        .post(&meta.token_endpoint)
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
    // `kid` connu du JWKS en cache ? Sinon, l'IdP a probablement tourné ses clés :
    // on force un refetch immédiat (au-delà du TTL) avant d'abandonner (RUST-04).
    let key = match jwks.find(&kid) {
        Some(jwk) => DecodingKey::from_jwk(jwk).map_err(|_| ApiError::Unauthorized)?,
        None => {
            let (meta, fresh) = fetch_oidc_metadata(state).await?;
            store_oidc_cache(state, &meta, &fresh);
            let jwk = fresh.find(&kid).ok_or(ApiError::Unauthorized)?;
            DecodingKey::from_jwk(jwk).map_err(|_| ApiError::Unauthorized)?
        }
    };

    // Issuer autoritatif issu de la discovery (évite tout écart de slash final
    // entre OIDC_ISSUER configuré et le claim `iss` du jeton).
    let claims = validate_id_token(
        &token.id_token,
        &key,
        &state.config.oidc_client_id,
        meta.issuer.as_str(),
    )?;

    if claims.nonce.as_deref() != Some(flow.nonce.as_str()) {
        return Err(ApiError::Unauthorized);
    }

    // Résolution / création du compte.
    let email = trusted_email(
        &claims.sub,
        claims.email.as_deref(),
        claims.email_verified == Some(true),
    );
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

/// Valide un `id_token` : signature RS256 (clé du JWKS), `aud` = notre client_id,
/// `iss` = l'issuer de la discovery, `exp`. L'algorithme est ÉPINGLÉ à RS256 : un
/// jeton HS256 (confusion d'algorithme, clé publique utilisée comme secret HMAC)
/// ou `none` est refusé avant toute vérification de signature. Fonction pure,
/// testée avec de vrais jetons RSA (le nonce est vérifié par l'appelant).
fn validate_id_token(
    id_token: &str,
    key: &DecodingKey,
    client_id: &str,
    issuer: &str,
) -> ApiResult<IdClaims> {
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&[issuer]);
    decode::<IdClaims>(id_token, key, &validation)
        .map(|data| data.claims)
        .map_err(|_| ApiError::Unauthorized)
}

/// Email à utiliser pour lier/créer le compte (SECURITY_FINDINGS.md #9) : celui
/// du fournisseur UNIQUEMENT s'il atteste l'avoir vérifié, sinon un repli
/// synthétique basé sur `sub` (garanti unique, jamais de collision avec un
/// compte existant). Sans ce garde-fou, `upsert_oidc_user` lierait/créerait par
/// email sur la seule foi d'un claim non vérifié : n'importe qui prétendant à
/// l'email de quelqu'un d'autre prendrait le contrôle de son compte PinkPhone
/// existant (CWE-345) — ou, pour un compte à créer, entrerait en collision avec
/// l'email — bien réel, lui — d'un compte existant (violation de contrainte
/// unique). Fonction pure, testée indépendamment de tout fournisseur OIDC.
fn trusted_email(sub: &str, claimed_email: Option<&str>, email_verified: bool) -> String {
    match claimed_email.filter(|_| email_verified) {
        Some(e) => e.trim().to_lowercase(),
        None => format!("{sub}@oidc.local"),
    }
}

/// Lie par `oidc_sub`, sinon par email (compte existant), sinon crée. `email`
/// doit déjà être digne de confiance à cet appel — voir `trusted_email`.
async fn upsert_oidc_user(
    state: &AppState,
    sub: &str,
    email: &str,
    display: &str,
) -> ApiResult<Uuid> {
    // Les 3 étapes (lookup par sub, liaison par email, création) dans UNE
    // transaction (RUST-05) ; l'index unique partiel sur `oidc_sub` (migration
    // 0018) garantit en plus l'absence de doublon même en cas de course.
    let mut tx = state.pool.begin().await?;

    if let Some(id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE oidc_sub = $1",
    )
    .bind(sub)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.commit().await?;
        return Ok(id);
    }

    if let Some(id) = sqlx::query_scalar::<_, Uuid>(
        "UPDATE users SET oidc_sub = $1 WHERE email = $2 RETURNING id",
    )
    .bind(sub)
    .bind(email)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.commit().await?;
        return Ok(id);
    }

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, display_name, oidc_sub)
         VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(email)
    .bind(display)
    .bind(sub)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Jetons RS256 réels, signés hors ligne avec une clé RSA-2048 jetable dont la
    // partie privée n a jamais été enregistrée : seuls le JWK PUBLIC et les jetons
    // sont ici. exp = 2100-01-01 (sauf EXPIRE). iss=https://idp.example.com,
    // aud=pinkphone-client, nonce=n0nce, sub=user-123.
    const JWK: &str = "{\"kty\":\"RSA\",\"n\":\"newfPjiAP8W85TIfZKIW_QqkF1_nXahkj_VKF8QPh16lsHYCWvyk5uL5H0TQkPshU5xGzX41oWgIy4MlrQlIREhZn7ljfy144CiAzwdbzLAni4bkSgafN_mzMvwmxhWG94ognlhxGpTsF9u1zVGm3YkEbOkTzLBar8CLOEdoAV6NRv3emxNN-dAEXqFOQhnjY4wpffSBPGzV_KtXH1ms816t-g4G9NRtlY2YTOZgLGjoLXUA-fZ-CP13KCNfyILZSVK1hf4Cj5TvtfG3mUMulIuq55h9l79cegEG2FoKnm40js0MBsQkwpEof4_HLXCwDarKe1y5FLGuWH8wHYGeYQ\",\"e\":\"AQAB\",\"kid\":\"test-key-1\",\"alg\":\"RS256\",\"use\":\"sig\"}";
    const VALID: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2lkcC5leGFtcGxlLmNvbSIsImF1ZCI6InBpbmtwaG9uZS1jbGllbnQiLCJzdWIiOiJ1c2VyLTEyMyIsIm5vbmNlIjoibjBuY2UiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTcwMDAwMDAwMCwiZW1haWwiOiJhbGljZUBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlfQ.J_XQIX5BwL9N2vCsE6B3fJ_QzugX0KkAlpNu1fn9q10sd0Jb_Qi46ez1xEjeeC4eQmBW-21DtXqOzR7spSDvEgjj1CnNHC8rzHKyFqOhaqFAJ83768lowo_Jan7cX6ULw1DirR5bTbZYNSqKR06n8B4YPVjv4Og2pQ-TZk4pdlglnaEj4cS7vKlLFsoCQjjOvBHUzSUWmiZZwgiqoii9gVGBRwJuUWbi1QrngIy5Zi64SnyMzZvckHYSw6kkZHYKdD7EhxRtbMcHxqwEv89JHM6LsXRsx59-ekb5RphQZTtAEa2N07W3eeCQEQxao70FOyjDt5cs5I5Se2e3ipcJmQ";
    const MAUVAISE_AUD: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2lkcC5leGFtcGxlLmNvbSIsImF1ZCI6ImF1dHJlLWNsaWVudCIsInN1YiI6InVzZXItMTIzIiwibm9uY2UiOiJuMG5jZSIsImV4cCI6NDEwMjQ0NDgwMCwiaWF0IjoxNzAwMDAwMDAwLCJlbWFpbCI6ImFsaWNlQGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWV9.ly9JrMjvuj_KTDCSa9nc3JPmH6dUG_Jw-xonbaVqcRFC_ByEcfA2IEyL7I0zFgOFDRUkyr5fd_Kfpo2TA1fvw6MAXmcpSUQ9Pcr4gXZ_D4v6UTopuHq7-eseMhFVEEd85uX1HlhfmRD7QIPSfJ3N4n-auZmZLRzaflb2Y2BNtrXZk-Xkkik_M9r9XvOgpg2GbPNRDindGjRzALJJedBy2sHGFVmZDnjONRH0w6_DIzI16R2-ny0JUy1e_RKHklXgEei-uL-m98I2U2aTaI7CUfbPS9i-a_0_tbdPa9vMcMPOXDkaqsSdBO8WputwJBqk5p5RWQwOAFVNTRoi_BZsFA";
    const MAUVAIS_ISS: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2V2aWwuZXhhbXBsZS5jb20iLCJhdWQiOiJwaW5rcGhvbmUtY2xpZW50Iiwic3ViIjoidXNlci0xMjMiLCJub25jZSI6Im4wbmNlIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3MDAwMDAwMDAsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0.KoKTkWNc77alsw3PVdiKyrXuAwO_daHX3KxkKj_-_Ivq7O9wYD6H-B2tYT1V3QlfkcTL3G3Mj9PQPdYynKTjQRVviVqdnYvoA0iZg1LWJVXz_h3vu-onztlKtClxbG63MerVrZ7gpB6gh302yLf4y8opH66K-fz5sZI01-tceD3g4AHAR7jdcQIF-yTEta1sxMdvNLG4KXxlYoBIi6M2Kcc3VX7Z3PgfCRiToazZXzbqyFFl-xpO38FmEtDD0FWMo_UsOtUUoDwgJCTEJ-Xh1Ke2SxBkMWw5p7IecAAvy_oWvS7kDSMbWKg1oklByxkqidBa2hsAxmPz9K7z9Slc3w";
    const EXPIRE: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2lkcC5leGFtcGxlLmNvbSIsImF1ZCI6InBpbmtwaG9uZS1jbGllbnQiLCJzdWIiOiJ1c2VyLTEyMyIsIm5vbmNlIjoibjBuY2UiLCJleHAiOjEwMDAwMDAwMDAsImlhdCI6MTcwMDAwMDAwMCwiZW1haWwiOiJhbGljZUBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlfQ.Ok0ceVkR-ibWlVi_l6H1Jg3lSyX03XhVn2U1F4BHMB0MXlyXMLRXJSd3T2SyZkLVn6rtfUeD0XGJpsuAR2p5cKNQxmAZY5EyF7IAuK-Yi3mTWZyv-4sJx_T3FIJ5zNoOgVqtmwxcsSOfXPxGSNp1tWbdTPcrQ3RrW64Sc0qInHAFEJ6oMq7-z0jPrwTE6wEFk-fcHu3SO0gT09FnEPK4ERT6YhPTg6QeOOnmeF9uyQFcsC-k1ja4-1z512Ut89NHAWOJBmaE-gUsXf4kWpOLGPqntfLKE6qgS_O67rqdUW4bEZvqmBb1M3-2l0njDsRJVLJvHReOCJZaUsCGR_n-ng";
    const PAYLOAD_ALTERE: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2lkcC5leGFtcGxlLmNvbSIsImF1ZCI6InBpbmtwaG9uZS1jbGllbnQiLCJzdWIiOiJhdHRhcXVhbnQiLCJub25jZSI6Im4wbmNlIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3MDAwMDAwMDAsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0.J_XQIX5BwL9N2vCsE6B3fJ_QzugX0KkAlpNu1fn9q10sd0Jb_Qi46ez1xEjeeC4eQmBW-21DtXqOzR7spSDvEgjj1CnNHC8rzHKyFqOhaqFAJ83768lowo_Jan7cX6ULw1DirR5bTbZYNSqKR06n8B4YPVjv4Og2pQ-TZk4pdlglnaEj4cS7vKlLFsoCQjjOvBHUzSUWmiZZwgiqoii9gVGBRwJuUWbi1QrngIy5Zi64SnyMzZvckHYSw6kkZHYKdD7EhxRtbMcHxqwEv89JHM6LsXRsx59-ekb5RphQZTtAEa2N07W3eeCQEQxao70FOyjDt5cs5I5Se2e3ipcJmQ";
    const HS256_CONFUSION: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ.eyJpc3MiOiJodHRwczovL2lkcC5leGFtcGxlLmNvbSIsImF1ZCI6InBpbmtwaG9uZS1jbGllbnQiLCJzdWIiOiJ1c2VyLTEyMyIsIm5vbmNlIjoibjBuY2UiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTcwMDAwMDAwMCwiZW1haWwiOiJhbGljZUBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlfQ.s6Nx7VYdiklrCwC8RJDwMmjV3oktrwXLOjbD2xjciVU";
    const ALG_NONE: &str = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lkcC5leGFtcGxlLmNvbSIsImF1ZCI6InBpbmtwaG9uZS1jbGllbnQiLCJzdWIiOiJ1c2VyLTEyMyIsIm5vbmNlIjoibjBuY2UiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTcwMDAwMDAwMCwiZW1haWwiOiJhbGljZUBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlfQ.";
    const ISS: &str = "https://idp.example.com";
    const AUD: &str = "pinkphone-client";

    fn cle() -> DecodingKey {
        let jwk: jsonwebtoken::jwk::Jwk = serde_json::from_str(JWK).unwrap();
        DecodingKey::from_jwk(&jwk).unwrap()
    }

    #[test]
    fn id_token_rs256_valide_accepte() {
        let c = validate_id_token(VALID, &cle(), AUD, ISS).expect("jeton valide");
        assert_eq!(c.sub, "user-123");
        assert_eq!(c.nonce.as_deref(), Some("n0nce"));
        assert_eq!(c.email.as_deref(), Some("alice@example.com"));
    }

    #[test]
    fn id_token_mauvaise_audience_refuse() {
        assert!(validate_id_token(MAUVAISE_AUD, &cle(), AUD, ISS).is_err());
    }

    #[test]
    fn id_token_mauvais_issuer_refuse() {
        assert!(validate_id_token(MAUVAIS_ISS, &cle(), AUD, ISS).is_err());
        // Et l issuer attendu est bien strict : le bon jeton échoue face à un autre issuer.
        assert!(validate_id_token(VALID, &cle(), AUD, "https://evil.example.com").is_err());
    }

    #[test]
    fn id_token_expire_refuse() {
        assert!(validate_id_token(EXPIRE, &cle(), AUD, ISS).is_err());
    }

    #[test]
    fn id_token_payload_altere_refuse() {
        // Signature d origine, payload modifié (sub) : la vérification RSA doit échouer.
        assert!(validate_id_token(PAYLOAD_ALTERE, &cle(), AUD, ISS).is_err());
    }

    #[test]
    fn id_token_confusion_hs256_et_alg_none_refuses() {
        // Algorithme épinglé à RS256 : ni HS256 (clé publique comme secret HMAC)
        // ni alg=none ne passent.
        assert!(validate_id_token(HS256_CONFUSION, &cle(), AUD, ISS).is_err());
        assert!(validate_id_token(ALG_NONE, &cle(), AUD, ISS).is_err());
    }

    #[test]
    fn email_verifie_utilise_tel_quel_normalise() {
        assert_eq!(
            trusted_email("sub-1", Some("  Partenaire@Example.COM "), true),
            "partenaire@example.com"
        );
    }

    #[test]
    fn email_non_verifie_jamais_utilise() {
        // Même si un email est présent, un claim non vérifié retombe sur le
        // repli synthétique — jamais sur l'email prétendu (SECURITY_FINDINGS.md #9).
        assert_eq!(
            trusted_email("sub-1", Some("victime@example.com"), false),
            "sub-1@oidc.local"
        );
    }

    #[test]
    fn aucun_email_fourni_retombe_sur_le_repli() {
        assert_eq!(trusted_email("sub-1", None, true), "sub-1@oidc.local");
        assert_eq!(trusted_email("sub-1", None, false), "sub-1@oidc.local");
    }

    #[test]
    fn pkce_challenge_vecteur_rfc_7636_annexe_b() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_b64_longueur_alphabet_et_unicite() {
        let a = random_b64(32);
        let b = random_b64(32);
        // 32 octets → 43 caractères base64url sans padding.
        assert_eq!(a.len(), 43);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(a, b);
    }
}
