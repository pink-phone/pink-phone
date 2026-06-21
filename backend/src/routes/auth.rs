use axum::extract::State;
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
}

#[derive(Deserialize)]
pub struct RegisterBody {
    pub email: String,
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
) -> ApiResult<Json<AuthResponse>> {
    if !state.config.password_auth_enabled {
        return Err(ApiError::Forbidden);
    }
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || body.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "email requis et mot de passe d'au moins 8 caractères".into(),
        ));
    }

    let existing: Option<uuid::Uuid> =
        sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.pool)
            .await?;
    if existing.is_some() {
        return Err(ApiError::Conflict("cet email est déjà utilisé".into()));
    }

    let hash = hash_password(&body.password)?;
    let user: UserPublic = sqlx::query_as(
        "INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, created_at",
    )
    .bind(&email)
    .bind(body.display_name.trim())
    .bind(&hash)
    .fetch_one(&state.pool)
    .await?;

    let token = issue_token(&state.config.jwt_secret, user.id)?;
    Ok(Json(AuthResponse { token, user }))
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
    let hash = user.as_ref().and_then(|u| u.password_hash.as_deref());
    let ok = verify_login(&body.password, hash);
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
