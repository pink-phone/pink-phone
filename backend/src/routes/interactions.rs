use std::collections::HashMap;

use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Comment, ReactionSummary, REACTIONS, VERDICTS};
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/spaces/{id}/posts/{pid}/reactions",
            axum::routing::post(add_reaction),
        )
        .route(
            "/api/spaces/{id}/posts/{pid}/reactions/{reaction}",
            axum::routing::delete(remove_reaction),
        )
        .route(
            "/api/spaces/{id}/posts/{pid}/verdict",
            put(set_verdict).delete(clear_verdict),
        )
        .route(
            "/api/spaces/{id}/posts/{pid}/comments",
            get(list_comments).post(add_comment),
        )
}

/// Vérifie l'appartenance au space ET que le post y appartient bien.
async fn guard(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    space_id: Uuid,
    post_id: Uuid,
) -> ApiResult<()> {
    ensure_member(pool, user_id, space_id).await?;
    let ok: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM posts WHERE id = $1 AND space_id = $2")
            .bind(post_id)
            .bind(space_id)
            .fetch_optional(pool)
            .await?;
    ok.map(|_| ()).ok_or(ApiError::NotFound)
}

async fn reaction_summary(
    pool: &sqlx::PgPool,
    post_id: Uuid,
    user_id: Uuid,
) -> ApiResult<ReactionSummary> {
    #[derive(sqlx::FromRow)]
    struct Row {
        reaction: String,
        n: i64,
    }
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT reaction, count(*) AS n FROM post_reactions
         WHERE post_id = $1 GROUP BY reaction",
    )
    .bind(post_id)
    .fetch_all(pool)
    .await?;
    let mine: Vec<String> = sqlx::query_scalar(
        "SELECT reaction FROM post_reactions WHERE post_id = $1 AND user_id = $2",
    )
    .bind(post_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut counts: HashMap<String, i64> = HashMap::new();
    for r in rows {
        counts.insert(r.reaction, r.n);
    }
    Ok(ReactionSummary {
        reaction_counts: counts,
        my_reactions: mine,
    })
}

// ---------- Réactions ----------

#[derive(Deserialize)]
pub struct ReactionBody {
    pub reaction: String,
}

async fn add_reaction(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ReactionBody>,
) -> ApiResult<Json<ReactionSummary>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    if !REACTIONS.contains(&body.reaction.as_str()) {
        return Err(ApiError::BadRequest("réaction inconnue".into()));
    }
    sqlx::query(
        "INSERT INTO post_reactions (post_id, user_id, reaction)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(post_id)
    .bind(auth.user_id)
    .bind(&body.reaction)
    .execute(&state.pool)
    .await?;
    state.emit(space_id, auth.user_id, "reaction");
    Ok(Json(reaction_summary(&state.pool, post_id, auth.user_id).await?))
}

async fn remove_reaction(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id, reaction)): Path<(Uuid, Uuid, String)>,
) -> ApiResult<Json<ReactionSummary>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    sqlx::query(
        "DELETE FROM post_reactions WHERE post_id = $1 AND user_id = $2 AND reaction = $3",
    )
    .bind(post_id)
    .bind(auth.user_id)
    .bind(&reaction)
    .execute(&state.pool)
    .await?;
    state.emit(space_id, auth.user_id, "reaction");
    Ok(Json(reaction_summary(&state.pool, post_id, auth.user_id).await?))
}

// ---------- Verdict ----------

#[derive(Deserialize)]
pub struct VerdictBody {
    pub verdict: String,
}

#[derive(Serialize)]
pub struct VerdictOut {
    pub verdict: Option<String>,
}

async fn set_verdict(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<VerdictBody>,
) -> ApiResult<Json<VerdictOut>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    if !VERDICTS.contains(&body.verdict.as_str()) {
        return Err(ApiError::BadRequest("verdict inconnu".into()));
    }
    sqlx::query(
        "INSERT INTO post_verdicts (post_id, user_id, verdict, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (post_id, user_id)
         DO UPDATE SET verdict = EXCLUDED.verdict, updated_at = now()",
    )
    .bind(post_id)
    .bind(auth.user_id)
    .bind(&body.verdict)
    .execute(&state.pool)
    .await?;
    Ok(Json(VerdictOut {
        verdict: Some(body.verdict),
    }))
}

async fn clear_verdict(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<VerdictOut>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    sqlx::query("DELETE FROM post_verdicts WHERE post_id = $1 AND user_id = $2")
        .bind(post_id)
        .bind(auth.user_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(VerdictOut { verdict: None }))
}

// ---------- Commentaires ----------

#[derive(Deserialize)]
pub struct CommentBody {
    pub body: String,
}

async fn list_comments(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<Vec<Comment>>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    let comments: Vec<Comment> = sqlx::query_as(
        "SELECT c.id, c.author_id, u.display_name AS author_name, c.body, c.created_at
         FROM post_comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.post_id = $1
         ORDER BY c.created_at",
    )
    .bind(post_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(comments))
}

async fn add_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CommentBody>,
) -> ApiResult<Json<Comment>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    if body.body.trim().is_empty() {
        return Err(ApiError::BadRequest("commentaire vide".into()));
    }
    let comment: Comment = sqlx::query_as(
        "WITH inserted AS (
             INSERT INTO post_comments (post_id, author_id, body)
             VALUES ($1, $2, $3)
             RETURNING id, author_id, body, created_at
         )
         SELECT i.id, i.author_id, u.display_name AS author_name, i.body, i.created_at
         FROM inserted i JOIN users u ON u.id = i.author_id",
    )
    .bind(post_id)
    .bind(auth.user_id)
    .bind(body.body.trim())
    .fetch_one(&state.pool)
    .await?;

    state.emit(space_id, auth.user_id, "comment");
    let preview: String = comment.body.chars().take(80).collect();
    crate::notifications::notify_members(
        &state,
        space_id,
        auth.user_id,
        "Nouveau commentaire".into(),
        preview,
    );

    Ok(Json(comment))
}
