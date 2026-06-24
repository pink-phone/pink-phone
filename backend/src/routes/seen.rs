use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::SeenEntry;
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

const FEATURES: [&str; 3] = ["blog", "challenges", "notices"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/seen", get(list_seen))
        .route("/api/spaces/{id}/seen/{feature}", put(mark_seen))
}

/// "Vu" de tous les membres du salon (pour badges + accusés de lecture).
async fn list_seen(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<SeenEntry>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let rows: Vec<SeenEntry> = sqlx::query_as(
        "SELECT user_id, feature, seen_at FROM space_last_seen WHERE space_id = $1",
    )
    .bind(space_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

/// Marque un fil comme vu maintenant par l'utilisateur courant (upsert).
async fn mark_seen(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, feature)): Path<(Uuid, String)>,
) -> ApiResult<Json<SeenEntry>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    if !FEATURES.contains(&feature.as_str()) {
        return Err(ApiError::BadRequest("fil inconnu".into()));
    }
    let entry: SeenEntry = sqlx::query_as(
        "INSERT INTO space_last_seen (user_id, space_id, feature, seen_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, space_id, feature)
         DO UPDATE SET seen_at = now()
         RETURNING user_id, feature, seen_at",
    )
    .bind(auth.user_id)
    .bind(space_id)
    .bind(&feature)
    .fetch_one(&state.pool)
    .await?;

    // Notifie l'autre membre pour mettre à jour les accusés de lecture en direct.
    state.emit(space_id, auth.user_id, EventKind::Seen);
    Ok(Json(entry))
}
