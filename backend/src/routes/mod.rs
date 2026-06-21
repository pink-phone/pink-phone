pub mod auth;
pub mod challenges;
pub mod interactions;
pub mod logs;
pub mod media;
pub mod moods;
pub mod notifications;
pub mod oidc;
pub mod posts;
pub mod seen;
pub mod spaces;
pub mod suggestions;
pub mod ws;

use axum::Router;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Vérifie que `user_id` appartient bien à `space_id`. Renvoie son rôle.
/// C'est la garde d'autorisation de tout contenu rattaché à un espace.
pub async fn ensure_member(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    space_id: Uuid,
) -> ApiResult<String> {
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM space_memberships WHERE user_id = $1 AND space_id = $2",
    )
    .bind(user_id)
    .bind(space_id)
    .fetch_optional(pool)
    .await?;

    role.ok_or(ApiError::Forbidden)
}

/// Assemble toutes les routes de l'API sous /api.
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(spaces::router())
        .merge(moods::router())
        .merge(posts::router())
        .merge(interactions::router())
        .merge(challenges::router())
        .merge(media::router())
        .merge(logs::router())
        .merge(notifications::router())
        .merge(oidc::router())
        .merge(seen::router())
        .merge(suggestions::router())
        .merge(ws::router())
}
