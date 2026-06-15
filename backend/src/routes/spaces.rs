use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Member, Space};
use crate::routes::ensure_member;
use crate::state::AppState;

// V1 : un espace accueille au plus 2 partenaires (le modèle reste multi-ready).
const MAX_MEMBERS: i64 = 2;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces", post(create_space))
        .route("/api/spaces/me", get(my_spaces))
        .route("/api/spaces/{id}/join", post(join_space))
        .route("/api/spaces/{id}/members", get(members))
}

#[derive(Deserialize)]
pub struct CreateSpaceBody {
    pub name: String,
}

async fn create_space(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateSpaceBody>,
) -> ApiResult<Json<Space>> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("nom d'espace requis".into()));
    }

    let mut tx = state.pool.begin().await?;
    let space: Space = sqlx::query_as(
        "INSERT INTO spaces (name) VALUES ($1) RETURNING id, name, timezone, created_at",
    )
    .bind(name)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO space_memberships (user_id, space_id, role) VALUES ($1, $2, 'partner')",
    )
    .bind(auth.user_id)
    .bind(space.id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(space))
}

async fn my_spaces(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<Space>>> {
    let spaces: Vec<Space> = sqlx::query_as(
        "SELECT s.id, s.name, s.timezone, s.created_at
         FROM spaces s
         JOIN space_memberships m ON m.space_id = s.id
         WHERE m.user_id = $1
         ORDER BY s.created_at",
    )
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(spaces))
}

async fn join_space(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Space>> {
    let mut tx = state.pool.begin().await?;

    let space: Option<Space> =
        sqlx::query_as("SELECT id, name, timezone, created_at FROM spaces WHERE id = $1")
            .bind(space_id)
            .fetch_optional(&mut *tx)
            .await?;
    let space = space.ok_or(ApiError::NotFound)?;

    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM space_memberships WHERE space_id = $1",
    )
    .bind(space_id)
    .fetch_one(&mut *tx)
    .await?;
    if count >= MAX_MEMBERS {
        return Err(ApiError::Conflict("cet espace est déjà complet".into()));
    }

    // ON CONFLICT : rejoindre deux fois est idempotent.
    sqlx::query(
        "INSERT INTO space_memberships (user_id, space_id, role)
         VALUES ($1, $2, 'partner')
         ON CONFLICT (user_id, space_id) DO NOTHING",
    )
    .bind(auth.user_id)
    .bind(space_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(space))
}

async fn members(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Member>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let members: Vec<Member> = sqlx::query_as(
        "SELECT u.id, u.display_name, m.role
         FROM space_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.space_id = $1
         ORDER BY m.created_at",
    )
    .bind(space_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(members))
}
