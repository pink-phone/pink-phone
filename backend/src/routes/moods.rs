use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Mood, MOODS};
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/mood", put(set_mood))
        .route("/api/spaces/{id}/moods", get(list_moods))
}

#[derive(Deserialize)]
pub struct SetMoodBody {
    pub status: String,
}

async fn set_mood(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<SetMoodBody>,
) -> ApiResult<Json<Mood>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    if !MOODS.contains(&body.status.as_str()) {
        return Err(ApiError::BadRequest("humeur inconnue".into()));
    }

    let mood: Mood = sqlx::query_as(
        "INSERT INTO moods (user_id, space_id, status, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, space_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = now()
         RETURNING user_id, status, updated_at",
    )
    .bind(auth.user_id)
    .bind(space_id)
    .bind(&body.status)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(mood))
}

async fn list_moods(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Mood>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    // La "météo du jour" : un mood se renouvelle toutes les 24h. Au-delà, il est
    // considéré périmé et n'est plus renvoyé (l'utilisateur est réinvité à le poser).
    let moods: Vec<Mood> = sqlx::query_as(
        "SELECT user_id, status, updated_at FROM moods
         WHERE space_id = $1 AND updated_at > now() - interval '24 hours'",
    )
    .bind(space_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(moods))
}
