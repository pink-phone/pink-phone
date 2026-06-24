use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use sqlx::PgExecutor;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::models::Notice;
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/spaces/{id}/notices", get(list_notices))
}

/// Enregistre une notice de salon (#84/#85). Générique sur l'exécuteur pour
/// pouvoir l'appeler dans une transaction (jointure) comme sur le pool.
/// Best-effort : une erreur est loguée mais ne fait pas échouer l'action.
pub async fn record<'e, E: PgExecutor<'e>>(
    ex: E,
    space_id: Uuid,
    kind: &str,
    actor_id: Uuid,
) {
    if let Err(e) = sqlx::query(
        "INSERT INTO space_notices (space_id, kind, actor_id) VALUES ($1, $2, $3)",
    )
    .bind(space_id)
    .bind(kind)
    .bind(actor_id)
    .execute(ex)
    .await
    {
        tracing::warn!(target: "notices", "enregistrement de notice échoué: {e}");
    }
}

/// Notices récentes du salon, hors les miennes (je ne me notifie pas moi-même).
/// Le frontend filtre les non-vues via le last-seen 'notices'.
async fn list_notices(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Notice>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let rows: Vec<Notice> = sqlx::query_as(
        "SELECT n.id, n.kind, n.actor_id, u.display_name AS actor_name, n.created_at
         FROM space_notices n
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.space_id = $1 AND (n.actor_id IS NULL OR n.actor_id <> $2)
         ORDER BY n.created_at DESC
         LIMIT 50",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}
