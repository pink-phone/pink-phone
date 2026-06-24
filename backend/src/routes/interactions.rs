use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Comment, ReactionSummary, REACTIONS, VERDICTS};
use crate::pagination::{Page, PageParams};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

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
        .route(
            "/api/spaces/{id}/posts/{pid}/comments/{cid}",
            axum::routing::patch(update_comment).delete(delete_comment),
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

/// Réaction acceptée : soit une prédéfinie, soit un emoji "libre" borné
/// (1 à 8 caractères, ≤ 32 octets, pas d'alphanumérique ASCII ni d'espace —
/// de quoi accepter un emoji, y compris séquences ZWJ, sans stocker du texte).
fn reaction_allowed(r: &str) -> bool {
    if REACTIONS.contains(&r) {
        return true;
    }
    let n = r.chars().count();
    n >= 1
        && n <= 8
        && r.len() <= 32
        && !r
            .chars()
            .any(|c| c.is_ascii_alphanumeric() || c.is_whitespace())
}

async fn add_reaction(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ReactionBody>,
) -> ApiResult<Json<ReactionSummary>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    let reaction = body.reaction.trim();
    if !reaction_allowed(reaction) {
        return Err(ApiError::BadRequest("réaction invalide".into()));
    }
    sqlx::query(
        "INSERT INTO post_reactions (post_id, user_id, reaction)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(post_id)
    .bind(auth.user_id)
    .bind(reaction)
    .execute(&state.pool)
    .await?;
    state.emit(space_id, auth.user_id, EventKind::Reaction);
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
    state.emit(space_id, auth.user_id, EventKind::Reaction);
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

/// Borne haute du corps d'un commentaire (RR-02) : le seul plafond sinon est le
/// `DefaultBodyLimit` global (100 Mo).
const MAX_COMMENT_LEN: usize = 8 * 1024;

#[derive(Deserialize)]
pub struct CommentBody {
    pub body: String,
}

/// Valide un corps de commentaire : non vide après trim, et borné.
fn validate_comment(body: &str) -> ApiResult<()> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(ApiError::BadRequest("commentaire vide".into()));
    }
    if trimmed.len() > MAX_COMMENT_LEN {
        return Err(ApiError::BadRequest("commentaire trop long".into()));
    }
    Ok(())
}

async fn list_comments(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Query(page): Query<PageParams>,
) -> ApiResult<Json<Page<Comment>>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    let limit = page.limit();
    // On pagine du plus RÉCENT vers le plus ancien (curseur `before`) : la page
    // par défaut renvoie les derniers commentaires, et « charger plus ancien »
    // remonte le fil. Le client réordonne en chronologique pour l'affichage.
    let comments: Vec<Comment> = sqlx::query_as(
        "SELECT c.id, c.author_id, u.display_name AS author_name, c.body, c.created_at, c.updated_at
         FROM post_comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.post_id = $1
           AND ($2::timestamptz IS NULL OR c.created_at < $2)
         ORDER BY c.created_at DESC
         LIMIT $3",
    )
    .bind(post_id)
    .bind(page.before)
    .bind(limit + 1)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(Page::from_rows(comments, limit)))
}

async fn add_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CommentBody>,
) -> ApiResult<(StatusCode, Json<Comment>)> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    validate_comment(&body.body)?;
    let comment: Comment = sqlx::query_as(
        "WITH inserted AS (
             INSERT INTO post_comments (post_id, author_id, body)
             VALUES ($1, $2, $3)
             RETURNING id, author_id, body, created_at, updated_at
         )
         SELECT i.id, i.author_id, u.display_name AS author_name, i.body, i.created_at, i.updated_at
         FROM inserted i JOIN users u ON u.id = i.author_id",
    )
    .bind(post_id)
    .bind(auth.user_id)
    .bind(body.body.trim())
    .fetch_one(&state.pool)
    .await?;

    state.emit(space_id, auth.user_id, EventKind::Comment);
    crate::notifications::notify_members(
        &state,
        space_id,
        auth.user_id,
        "Nouveau commentaire".into(),
    );

    Ok((StatusCode::CREATED, Json(comment)))
}

/// Édite un commentaire (auteur uniquement). N'émet pas de notification (pas un
/// nouveau contenu), mais émet l'event WS `comment` pour le rafraîchissement.
async fn update_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id, comment_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(body): Json<CommentBody>,
) -> ApiResult<Json<Comment>> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    validate_comment(&body.body)?;
    // L'UPDATE filtre sur post_id ET author_id : 0 ligne ⇒ inexistant ou pas le
    // sien (on ne distingue pas → NotFound, comme delete_post).
    let comment: Option<Comment> = sqlx::query_as(
        "WITH updated AS (
             UPDATE post_comments
             SET body = $1, updated_at = now()
             WHERE id = $2 AND post_id = $3 AND author_id = $4
             RETURNING id, author_id, body, created_at, updated_at
         )
         SELECT u2.id, u2.author_id, usr.display_name AS author_name, u2.body, u2.created_at, u2.updated_at
         FROM updated u2 JOIN users usr ON usr.id = u2.author_id",
    )
    .bind(body.body.trim())
    .bind(comment_id)
    .bind(post_id)
    .bind(auth.user_id)
    .fetch_optional(&state.pool)
    .await?;
    let comment = comment.ok_or(ApiError::NotFound)?;

    state.emit(space_id, auth.user_id, EventKind::Comment);
    Ok(Json(comment))
}

/// Supprime un commentaire (auteur uniquement).
async fn delete_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id, comment_id)): Path<(Uuid, Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    guard(&state.pool, auth.user_id, space_id, post_id).await?;
    let deleted: Option<Uuid> = sqlx::query_scalar(
        "DELETE FROM post_comments
         WHERE id = $1 AND post_id = $2 AND author_id = $3
         RETURNING id",
    )
    .bind(comment_id)
    .bind(post_id)
    .bind(auth.user_id)
    .fetch_optional(&state.pool)
    .await?;
    deleted.ok_or(ApiError::NotFound)?;

    state.emit(space_id, auth.user_id, EventKind::Comment);
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reactions_predefinies_acceptees() {
        for r in REACTIONS {
            assert!(reaction_allowed(r), "{r} devrait être accepté");
        }
    }

    #[test]
    fn emoji_libre_accepte() {
        assert!(reaction_allowed("🔥"));
        assert!(reaction_allowed("👍"));
    }

    #[test]
    fn texte_et_vide_refuses() {
        assert!(!reaction_allowed("")); // vide
        assert!(!reaction_allowed("lol")); // alphanumérique ASCII
        assert!(!reaction_allowed("a")); // une lettre
        assert!(!reaction_allowed("🔥 ok")); // contient un espace
        assert!(!reaction_allowed(&"🔥".repeat(9))); // > 8 caractères
    }
}
