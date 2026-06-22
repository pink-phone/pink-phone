use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, patch, put};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{ChallengeSuggestion, INTENSITIES};
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/spaces/{id}/suggestions",
            get(list_suggestions).post(create_suggestion),
        )
        .route(
            "/api/spaces/{id}/suggestions/{sid}",
            patch(update_suggestion).delete(delete_suggestion),
        )
        // #70 : masquer / réafficher une suggestion par salon.
        .route(
            "/api/spaces/{id}/suggestions/{sid}/hidden",
            put(set_hidden),
        )
}

#[derive(Deserialize)]
struct ListQuery {
    lang: Option<String>,
}

/// Normalise la langue vers un littéral statique connu (défaut « fr »). RUST-15.
fn norm_locale(lang: Option<&str>) -> &'static str {
    match lang {
        Some("en") => "en",
        _ => "fr",
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

    // Banque curatée (seed + propres au salon) : pas de pagination par curseur,
    // mais un plafond de sûreté pour ne jamais charger une liste non bornée (RUST-12).
    // `done` (#69) : un défi issu de cette suggestion est passé à jobDone dans le
    // salon. `hidden` (#70) : suggestion masquée par le salon.
    let query = "SELECT s.id, s.space_id, s.title, s.description, s.intensity, s.locale,
                        EXISTS(SELECT 1 FROM challenges c
                               WHERE c.source_suggestion_id = s.id
                                 AND c.space_id = $1 AND c.status = 'jobDone') AS done,
                        EXISTS(SELECT 1 FROM hidden_suggestions h
                               WHERE h.suggestion_id = s.id
                                 AND h.space_id = $1) AS hidden
                 FROM challenge_suggestions s
                 WHERE (s.space_id IS NULL OR s.space_id = $1) AND s.locale = $2
                 ORDER BY s.created_at
                 LIMIT 500";
    let mut items: Vec<ChallengeSuggestion> = sqlx::query_as(query)
        .bind(space_id)
        .bind(lang)
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
    // Description optionnelle (#68) : un titre suffit.
    if body.title.trim().is_empty() {
        return Err(ApiError::BadRequest("titre requis".into()));
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
) -> ApiResult<(StatusCode, Json<ChallengeSuggestion>)> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    validate(&body)?;
    let locale = norm_locale(body.locale.as_deref());
    let item: ChallengeSuggestion = sqlx::query_as(
        "INSERT INTO challenge_suggestions
            (space_id, created_by, locale, title, description, intensity)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, space_id, title, description, intensity, locale",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(locale)
    .bind(body.title.trim())
    .bind(body.description.trim())
    .bind(&body.intensity)
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(item)))
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
         RETURNING id, space_id, title, description, intensity, locale",
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

#[derive(Deserialize)]
struct HiddenBody {
    hidden: bool,
}

/// Masque (`hidden:true`) ou réaffiche (`false`) une suggestion POUR CE SALON
/// (#70) : marche aussi sur le seed global (`space_id IS NULL`), que le salon ne
/// peut pas supprimer. Idempotent.
async fn set_hidden(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, sid)): Path<(Uuid, Uuid)>,
    Json(body): Json<HiddenBody>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    // La suggestion doit être visible du salon (seed global OU propre au salon).
    let visible: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM challenge_suggestions
         WHERE id = $1 AND (space_id IS NULL OR space_id = $2)",
    )
    .bind(sid)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    if visible.is_none() {
        return Err(ApiError::NotFound);
    }

    if body.hidden {
        sqlx::query(
            "INSERT INTO hidden_suggestions (space_id, suggestion_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(space_id)
        .bind(sid)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query(
            "DELETE FROM hidden_suggestions WHERE space_id = $1 AND suggestion_id = $2",
        )
        .bind(space_id)
        .bind(sid)
        .execute(&state.pool)
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}
