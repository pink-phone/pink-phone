use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, patch};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{ChallengeSuggestion, INTENSITIES};
use crate::routes::ensure_member;
use crate::state::AppState;

const LOCALES: [&str; 2] = ["fr", "en"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/spaces/{id}/challenge-suggestions",
            get(list_suggestions).post(create_suggestion),
        )
        .route(
            "/api/spaces/{id}/challenge-suggestions/{sid}",
            patch(update_suggestion).delete(delete_suggestion),
        )
}

#[derive(Deserialize)]
struct ListQuery {
    lang: Option<String>,
}

fn norm_locale(lang: Option<&str>) -> String {
    match lang {
        Some(l) if LOCALES.contains(&l) => l.to_string(),
        _ => "fr".to_string(),
    }
}

/// Banque visible dans le salon : suggestions globales (seed) + propres au salon,
/// dans la langue demandée — repli sur 'fr' si rien dans cette langue.
async fn list_suggestions(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<Vec<ChallengeSuggestion>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let lang = norm_locale(q.lang.as_deref());

    let query = "SELECT id, space_id, title, description, intensity
                 FROM challenge_suggestions
                 WHERE (space_id IS NULL OR space_id = $1) AND locale = $2
                 ORDER BY created_at";
    let mut items: Vec<ChallengeSuggestion> = sqlx::query_as(query)
        .bind(space_id)
        .bind(&lang)
        .fetch_all(&state.pool)
        .await?;
    if items.is_empty() && lang != "fr" {
        items = sqlx::query_as(query)
            .bind(space_id)
            .bind("fr")
            .fetch_all(&state.pool)
            .await?;
    }
    Ok(Json(items))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionBody {
    pub title: String,
    pub description: String,
    pub intensity: String,
    pub locale: Option<String>,
}

fn validate(body: &SuggestionBody) -> ApiResult<()> {
    if body.title.trim().is_empty() || body.description.trim().is_empty() {
        return Err(ApiError::BadRequest("titre et description requis".into()));
    }
    if !INTENSITIES.contains(&body.intensity.as_str()) {
        return Err(ApiError::BadRequest("intensité inconnue".into()));
    }
    Ok(())
}

/// Ajoute une suggestion propre au salon (membre).
async fn create_suggestion(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<SuggestionBody>,
) -> ApiResult<Json<ChallengeSuggestion>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    validate(&body)?;
    let locale = norm_locale(body.locale.as_deref());
    let item: ChallengeSuggestion = sqlx::query_as(
        "INSERT INTO challenge_suggestions
            (space_id, created_by, locale, title, description, intensity)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, space_id, title, description, intensity",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&locale)
    .bind(body.title.trim())
    .bind(body.description.trim())
    .bind(&body.intensity)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(item))
}

/// Édite une suggestion DU SALON (pas le seed global).
async fn update_suggestion(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, sid)): Path<(Uuid, Uuid)>,
    Json(body): Json<SuggestionBody>,
) -> ApiResult<Json<ChallengeSuggestion>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    validate(&body)?;
    // Restreint au créateur (SEC-013), comme la suppression de post/défi : un
    // membre n'édite que ses propres suggestions du salon (le seed global a
    // `space_id IS NULL` et n'est donc jamais ciblé ici).
    let item: Option<ChallengeSuggestion> = sqlx::query_as(
        "UPDATE challenge_suggestions
         SET title = $3, description = $4, intensity = $5
         WHERE id = $1 AND space_id = $2 AND created_by = $6
         RETURNING id, space_id, title, description, intensity",
    )
    .bind(sid)
    .bind(space_id)
    .bind(body.title.trim())
    .bind(body.description.trim())
    .bind(&body.intensity)
    .bind(auth.user_id)
    .fetch_optional(&state.pool)
    .await?;
    item.map(Json).ok_or(ApiError::NotFound)
}

/// Supprime une suggestion DU SALON (pas le seed global).
async fn delete_suggestion(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, sid)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    // Restreint au créateur (SEC-013), comme la suppression de post/défi.
    let res = sqlx::query(
        "DELETE FROM challenge_suggestions
         WHERE id = $1 AND space_id = $2 AND created_by = $3",
    )
    .bind(sid)
    .bind(space_id)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
