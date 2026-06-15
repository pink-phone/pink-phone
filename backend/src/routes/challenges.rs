use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{challenge_transition_allowed, Challenge, INTENSITIES};
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/spaces/{id}/challenges",
            get(list_challenges).post(create_challenge),
        )
        .route(
            "/api/spaces/{id}/challenges/{cid}/status",
            axum::routing::patch(transition),
        )
        .route(
            "/api/spaces/{id}/challenges/{cid}",
            axum::routing::delete(delete_challenge),
        )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChallengeBody {
    pub title: String,
    pub description: String,
    pub intensity: String,
    pub deadline_label: Option<String>,
}

#[derive(Deserialize)]
pub struct TransitionBody {
    pub status: String,
}

async fn list_challenges(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Challenge>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let items: Vec<Challenge> = sqlx::query_as(
        "SELECT id, proposer_id, title, description, intensity, status,
                deadline_label, created_at, updated_at
         FROM challenges WHERE space_id = $1
         ORDER BY created_at DESC",
    )
    .bind(space_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(items))
}

async fn create_challenge(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<CreateChallengeBody>,
) -> ApiResult<Json<Challenge>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    if body.title.trim().is_empty() || body.description.trim().is_empty() {
        return Err(ApiError::BadRequest("titre et description requis".into()));
    }
    if !INTENSITIES.contains(&body.intensity.as_str()) {
        return Err(ApiError::BadRequest("intensité inconnue".into()));
    }

    let challenge: Challenge = sqlx::query_as(
        "INSERT INTO challenges
            (space_id, proposer_id, title, description, intensity, deadline_label)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, proposer_id, title, description, intensity, status,
                   deadline_label, created_at, updated_at",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(body.title.trim())
    .bind(body.description.trim())
    .bind(&body.intensity)
    .bind(
        body.deadline_label
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .fetch_one(&state.pool)
    .await?;

    crate::notifications::notify_members(
        &state,
        space_id,
        auth.user_id,
        "Nouveau défi".into(),
        challenge.title.clone(),
    );

    Ok(Json(challenge))
}

async fn transition(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, challenge_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<TransitionBody>,
) -> ApiResult<Json<Challenge>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let current: Option<String> = sqlx::query_scalar(
        "SELECT status FROM challenges WHERE id = $1 AND space_id = $2",
    )
    .bind(challenge_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    let current = current.ok_or(ApiError::NotFound)?;

    if !challenge_transition_allowed(&current, &body.status) {
        return Err(ApiError::Conflict(format!(
            "transition {current} → {} interdite",
            body.status
        )));
    }

    let challenge: Challenge = sqlx::query_as(
        "UPDATE challenges SET status = $1, updated_at = now()
         WHERE id = $2 AND space_id = $3
         RETURNING id, proposer_id, title, description, intensity, status,
                   deadline_label, created_at, updated_at",
    )
    .bind(&body.status)
    .bind(challenge_id)
    .bind(space_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(challenge))
}

/// Suppression d'un défi (proposeur uniquement).
async fn delete_challenge(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, challenge_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let proposer: Option<Uuid> = sqlx::query_scalar(
        "SELECT proposer_id FROM challenges WHERE id = $1 AND space_id = $2",
    )
    .bind(challenge_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    let proposer = proposer.ok_or(ApiError::NotFound)?;
    if proposer != auth.user_id {
        return Err(ApiError::Forbidden);
    }

    sqlx::query("DELETE FROM challenges WHERE id = $1 AND space_id = $2")
        .bind(challenge_id)
        .bind(space_id)
        .execute(&state.pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
