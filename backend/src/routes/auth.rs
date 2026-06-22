use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::{hash_password, issue_token, verify_login, AuthUser};
use crate::error::{ApiError, ApiResult};
use crate::models::{User, UserPublic};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/me", get(me))
        .route("/api/auth/logout-all", post(logout_all))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterBody {
    pub email: String,
    /// JSON `displayName` (camelCase, cohérent avec le reste de l'API — API-07).
    pub display_name: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> ApiResult<(StatusCode, Json<AuthResponse>)> {
    if !state.config.password_auth_enabled {
        return Err(ApiError::Forbidden);
    }
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || body.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "email requis et mot de passe d'au moins 8 caractères".into(),
        ));
    }

    // Anti-énumération (SEC-011) : on hache TOUJOURS avant de tenter l'insert (pas
    // de pré-SELECT qui répondrait vite pour un email pris et lentement pour un
    // libre — oracle temporel), et un email déjà pris ne renvoie qu'un message
    // GÉNÉRIQUE (jamais « cet email existe »). L'unicité est garantie par la
    // contrainte DB (`ON CONFLICT DO NOTHING` → aussi à l'abri d'une course).
    let hash = hash_password(body.password).await?;
    let user: Option<UserPublic> = sqlx::query_as(
        "INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, display_name, created_at",
    )
    .bind(&email)
    .bind(body.display_name.trim())
    .bind(&hash)
    .fetch_optional(&state.pool)
    .await?;
    let user = user.ok_or_else(|| {
        ApiError::BadRequest("impossible de créer le compte avec ces informations".into())
    })?;

    let token = issue_token(&state.config.jwt_secret, user.id)?;
    Ok((StatusCode::CREATED, Json(AuthResponse { token, user })))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> ApiResult<Json<AuthResponse>> {
    if !state.config.password_auth_enabled {
        return Err(ApiError::Forbidden);
    }
    let email = body.email.trim().to_lowercase();
    let user: Option<User> = sqlx::query_as(
        "SELECT id, email, display_name, password_hash, created_at
         FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    // On vérifie TOUJOURS (hash réel ou leurre) avant de trancher, pour ne pas
    // révéler par le temps de réponse si l'email existe (SEC-010).
    let hash = user.as_ref().and_then(|u| u.password_hash.clone());
    let ok = verify_login(body.password, hash).await;
    let user = user.ok_or(ApiError::Unauthorized)?;
    if !ok {
        return Err(ApiError::Unauthorized);
    }

    let token = issue_token(&state.config.jwt_secret, user.id)?;
    Ok(Json(AuthResponse {
        token,
        user: UserPublic {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            created_at: user.created_at,
        },
    }))
}

async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<UserPublic>> {
    let user: UserPublic = sqlx::query_as(
        "SELECT id, email, display_name, created_at FROM users WHERE id = $1",
    )
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(user))
}

/// Révoque TOUS les jetons de l'utilisateur (SEC-003) — le « panic button » en cas
/// de perte/vol d'appareil. Fixe `min_token_iat = now()` : tous les JWT émis avant
/// (y compris celui de cette requête) deviennent invalides. Le client doit ensuite
/// se reconnecter.
async fn logout_all(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<StatusCode> {
    sqlx::query("UPDATE users SET min_token_iat = now() WHERE id = $1")
        .bind(auth.user_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
