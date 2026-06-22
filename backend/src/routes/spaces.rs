use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Member, Space, REACTIONS};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

// V1 : un espace accueille au plus 2 partenaires (le modèle reste multi-ready).
const MAX_MEMBERS: i64 = 2;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces", post(create_space))
        .route("/api/spaces/me", get(my_spaces))
        .route("/api/spaces/join", post(join_by_invite))
        .route("/api/spaces/{id}", axum::routing::patch(update_space))
        .route("/api/spaces/{id}/invites", post(create_invite))
        .route("/api/spaces/{id}/members", get(members))
}

#[derive(Deserialize)]
pub struct CreateSpaceBody {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceBody {
    pub name: Option<String>,
    pub timezone: Option<String>,
    /// Réactions prédéfinies actives, dans l'ordre voulu.
    pub reactions: Option<Vec<String>>,
    pub allow_custom_reactions: Option<bool>,
    pub blind_mood: Option<bool>,
}

async fn create_space(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateSpaceBody>,
) -> ApiResult<(StatusCode, Json<Space>)> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("nom d'espace requis".into()));
    }

    let mut tx = state.pool.begin().await?;
    let space: Space = sqlx::query_as(
        "INSERT INTO spaces (name) VALUES ($1)
         RETURNING id, name, timezone, reactions, allow_custom_reactions, blind_mood, created_at",
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

    Ok((StatusCode::CREATED, Json(space)))
}

/// Met à jour le salon (nom et/ou fuseau). Tout membre peut l'éditer.
async fn update_space(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<UpdateSpaceBody>,
) -> ApiResult<Json<Space>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let name = match &body.name {
        Some(n) => {
            let n = n.trim();
            if n.is_empty() {
                return Err(ApiError::BadRequest("nom d'espace requis".into()));
            }
            Some(n.to_string())
        }
        None => None,
    };

    if let Some(tz) = &body.timezone {
        let ok: Option<String> =
            sqlx::query_scalar("SELECT name FROM pg_timezone_names WHERE name = $1")
                .bind(tz)
                .fetch_optional(&state.pool)
                .await?;
        if ok.is_none() {
            return Err(ApiError::BadRequest("fuseau horaire inconnu".into()));
        }
    }

    if let Some(reactions) = &body.reactions {
        if reactions.iter().any(|r| !REACTIONS.contains(&r.as_str())) {
            return Err(ApiError::BadRequest("réaction inconnue".into()));
        }
    }

    let space: Space = sqlx::query_as(
        "UPDATE spaces SET
            name = COALESCE($2, name),
            timezone = COALESCE($3, timezone),
            reactions = COALESCE($4, reactions),
            allow_custom_reactions = COALESCE($5, allow_custom_reactions),
            blind_mood = COALESCE($6, blind_mood)
         WHERE id = $1
         RETURNING id, name, timezone, reactions, allow_custom_reactions, blind_mood, created_at",
    )
    .bind(space_id)
    .bind(name)
    .bind(&body.timezone)
    .bind(body.reactions.as_deref())
    .bind(body.allow_custom_reactions)
    .bind(body.blind_mood)
    .fetch_one(&state.pool)
    .await?;

    state.emit(space_id, auth.user_id, EventKind::Space);
    Ok(Json(space))
}

async fn my_spaces(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<Space>>> {
    let spaces: Vec<Space> = sqlx::query_as(
        "SELECT s.id, s.name, s.timezone, s.reactions, s.allow_custom_reactions, s.blind_mood, s.created_at
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteCreated {
    pub token: Uuid,
}

/// Génère une invitation à usage unique (valable 7 jours) pour ce salon.
async fn create_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<InviteCreated>)> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let token: Uuid = sqlx::query_scalar(
        "INSERT INTO space_invites (space_id, created_by, expires_at)
         VALUES ($1, $2, now() + interval '7 days') RETURNING token",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(InviteCreated { token })))
}

#[derive(Deserialize)]
pub struct JoinBody {
    pub token: Uuid,
}

/// Rejoint un salon via un token d'invitation (SEC-005). Atomique : verrouille le
/// salon pour sérialiser le contrôle de la limite de membres (corrige le TOCTOU),
/// vérifie l'invitation (non utilisée, non expirée) et la consomme.
async fn join_by_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<JoinBody>,
) -> ApiResult<(StatusCode, Json<Space>)> {
    let mut tx = state.pool.begin().await?;

    // Invitation verrouillée le temps de la transaction.
    let invite: Option<(Uuid, Option<chrono::DateTime<chrono::Utc>>, bool)> =
        sqlx::query_as(
            "SELECT space_id, used_at, (expires_at < now()) AS expired
             FROM space_invites WHERE token = $1 FOR UPDATE",
        )
        .bind(body.token)
        .fetch_optional(&mut *tx)
        .await?;
    let (space_id, used_at, expired) =
        invite.ok_or(ApiError::BadRequest("invitation invalide".into()))?;
    if used_at.is_some() {
        return Err(ApiError::Conflict("invitation déjà utilisée".into()));
    }
    if expired {
        return Err(ApiError::Conflict("invitation expirée".into()));
    }

    let space: Space = sqlx::query_as(
        "SELECT id, name, timezone, reactions, allow_custom_reactions, blind_mood, created_at
         FROM spaces WHERE id = $1 FOR UPDATE",
    )
    .bind(space_id)
    .fetch_one(&mut *tx)
    .await?;

    // Déjà membre : on renvoie le salon sans consommer l'invitation.
    let already: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM space_memberships WHERE user_id = $1 AND space_id = $2",
    )
    .bind(auth.user_id)
    .bind(space_id)
    .fetch_optional(&mut *tx)
    .await?;
    if already.is_some() {
        tx.commit().await?;
        return Ok((StatusCode::OK, Json(space)));
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM space_memberships WHERE space_id = $1",
    )
    .bind(space_id)
    .fetch_one(&mut *tx)
    .await?;
    if count >= MAX_MEMBERS {
        return Err(ApiError::Conflict("cet espace est déjà complet".into()));
    }

    sqlx::query(
        "INSERT INTO space_memberships (user_id, space_id, role) VALUES ($1, $2, 'partner')",
    )
    .bind(auth.user_id)
    .bind(space_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE space_invites SET used_at = now(), used_by = $1 WHERE token = $2")
        .bind(auth.user_id)
        .bind(body.token)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(space)))
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
