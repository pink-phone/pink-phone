use std::collections::HashMap;
use std::path::Path as FsPath;

use chrono::{DateTime, Utc};

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{delete, get};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Post, PostRow};
use crate::pagination::{Page, PageParams};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/posts", get(list_posts).post(create_post))
        .route(
            "/api/spaces/{id}/posts/{pid}",
            delete(delete_post).patch(update_post),
        )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostBody {
    pub title: Option<String>,
    pub body: String,
    pub media_id: Option<Uuid>,
    /// Brouillon : visible du seul auteur, sans notification.
    #[serde(default)]
    pub draft: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePostBody {
    /// Présent ⇒ remplace le titre (vide ⇒ supprime). Absent ⇒ inchangé.
    /// Réservé aux brouillons.
    pub title: Option<String>,
    /// Présent ⇒ remplace le récit. Absent ⇒ inchangé. Réservé aux brouillons.
    pub body: Option<String>,
    /// Présent ⇒ attache/remplace le média (doit appartenir à l'espace).
    /// Réservé aux brouillons.
    pub media_id: Option<Uuid>,
    /// Détache le média existant. Réservé aux brouillons.
    #[serde(default)]
    pub clear_media: bool,
    /// Publication d'un brouillon (`false`) ou remise en brouillon (`true`).
    pub draft: Option<bool>,
}

#[derive(sqlx::FromRow)]
struct ReactionRow {
    post_id: Uuid,
    reaction: String,
    user_id: Uuid,
}

#[derive(sqlx::FromRow)]
struct VerdictRow {
    post_id: Uuid,
    verdict: String,
}

#[derive(sqlx::FromRow)]
struct CountRow {
    post_id: Uuid,
    n: i64,
}

/// Enrichit une seule ligne (création/édition) sans `remove(0)` fragile (RUST-09).
async fn enrich_one(pool: &sqlx::PgPool, row: PostRow, user_id: Uuid) -> ApiResult<Post> {
    enrich(pool, vec![row], user_id)
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::Internal)
}

/// Enrichit des posts bruts avec leurs interactions (réactions / verdict / nb
/// de commentaires), en quelques requêtes groupées plutôt qu'une par post.
async fn enrich(
    pool: &sqlx::PgPool,
    rows: Vec<PostRow>,
    user_id: Uuid,
) -> ApiResult<Vec<Post>> {
    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    let reactions: Vec<ReactionRow> = sqlx::query_as(
        "SELECT post_id, reaction, user_id FROM post_reactions WHERE post_id = ANY($1)",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let verdicts: Vec<VerdictRow> = sqlx::query_as(
        "SELECT post_id, verdict FROM post_verdicts WHERE post_id = ANY($1) AND user_id = $2",
    )
    .bind(&ids)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let counts: Vec<CountRow> = sqlx::query_as(
        "SELECT post_id, count(*) AS n FROM post_comments
         WHERE post_id = ANY($1) GROUP BY post_id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    // Dernier commentaire posté par quelqu'un d'autre (pour le badge « nouveaux
    // commentaires » du dashboard, comparé à mon last_seen côté client).
    let last_comments: Vec<(Uuid, DateTime<Utc>)> = sqlx::query_as(
        "SELECT post_id, max(created_at) FROM post_comments
         WHERE post_id = ANY($1) AND author_id <> $2 GROUP BY post_id",
    )
    .bind(&ids)
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let last_comment_by_post: HashMap<Uuid, DateTime<Utc>> =
        last_comments.into_iter().collect();

    let mut counts_by_post: HashMap<Uuid, HashMap<String, i64>> = HashMap::new();
    let mut mine_by_post: HashMap<Uuid, Vec<String>> = HashMap::new();
    for r in reactions {
        *counts_by_post
            .entry(r.post_id)
            .or_default()
            .entry(r.reaction.clone())
            .or_insert(0) += 1;
        if r.user_id == user_id {
            mine_by_post.entry(r.post_id).or_default().push(r.reaction);
        }
    }
    let verdict_by_post: HashMap<Uuid, String> =
        verdicts.into_iter().map(|v| (v.post_id, v.verdict)).collect();
    let comments_by_post: HashMap<Uuid, i64> =
        counts.into_iter().map(|c| (c.post_id, c.n)).collect();

    Ok(rows
        .into_iter()
        .map(|p| Post {
            reaction_counts: counts_by_post.remove(&p.id).unwrap_or_default(),
            my_reactions: mine_by_post.remove(&p.id).unwrap_or_default(),
            verdict: verdict_by_post.get(&p.id).cloned(),
            comment_count: comments_by_post.get(&p.id).copied().unwrap_or(0),
            last_comment_at: last_comment_by_post.get(&p.id).copied(),
            id: p.id,
            author_id: p.author_id,
            author_name: p.author_name,
            title: p.title,
            body: p.body,
            media_id: p.media_id,
            media_view_once: p.media_view_once,
            media_consumed: p.media_consumed,
            media_mime: p.media_mime,
            draft: p.draft,
            created_at: p.created_at,
        })
        .collect())
}

async fn list_posts(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Query(page): Query<PageParams>,
) -> ApiResult<Json<Page<Post>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let limit = page.limit();

    // Les brouillons ne sont visibles que de leur auteur. Pagination par curseur
    // `before` (created_at) ; on fetch `limit + 1` pour déduire `has_more`.
    let rows: Vec<PostRow> = sqlx::query_as(
        "SELECT p.id, p.author_id, u.display_name AS author_name,
                p.title, p.body, p.media_id, m.view_once AS media_view_once,
                m.consumed AS media_consumed, m.mime AS media_mime, p.draft, p.created_at
         FROM posts p
         JOIN users u ON u.id = p.author_id
         LEFT JOIN media m ON m.id = p.media_id
         WHERE p.space_id = $1 AND (p.draft = false OR p.author_id = $2)
           AND ($3::timestamptz IS NULL OR p.created_at < $3)
         ORDER BY p.created_at DESC
         LIMIT $4",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(page.before)
    .bind(limit + 1)
    .fetch_all(&state.pool)
    .await?;

    let Page { items: rows, has_more } = Page::from_rows(rows, limit);
    let items = enrich(&state.pool, rows, auth.user_id).await?;
    Ok(Json(Page { items, has_more }))
}

async fn create_post(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<CreatePostBody>,
) -> ApiResult<(StatusCode, Json<Post>)> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    // Un post peut être un simple média : on exige un récit OU un média.
    if body.body.trim().is_empty() && body.media_id.is_none() {
        return Err(ApiError::BadRequest(
            "un récit ou un média est requis".into(),
        ));
    }

    // Un média joint doit appartenir au même espace.
    if let Some(media_id) = body.media_id {
        let ok: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM media WHERE id = $1 AND space_id = $2",
        )
        .bind(media_id)
        .bind(space_id)
        .fetch_optional(&state.pool)
        .await?;
        if ok.is_none() {
            return Err(ApiError::BadRequest("média introuvable pour cet espace".into()));
        }
    }

    let row: PostRow = sqlx::query_as(
        "WITH inserted AS (
             INSERT INTO posts (space_id, author_id, title, body, media_id, draft)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, author_id, title, body, media_id, draft, created_at
         )
         SELECT i.id, i.author_id, u.display_name AS author_name,
                i.title, i.body, i.media_id, m.view_once AS media_view_once,
                m.consumed AS media_consumed, m.mime AS media_mime, i.draft, i.created_at
         FROM inserted i
         JOIN users u ON u.id = i.author_id
         LEFT JOIN media m ON m.id = i.media_id",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(body.title.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.body.trim())
    .bind(body.media_id)
    .bind(body.draft)
    .fetch_one(&state.pool)
    .await?;

    let post = enrich_one(&state.pool, row, auth.user_id).await?;
    // Un brouillon ne fait pas signe au/à la partenaire.
    if !post.draft {
        state.emit(space_id, auth.user_id, EventKind::Post);
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "Nouveau message".into(),
        );
    }
    Ok((StatusCode::CREATED, Json(post)))
}

/// Suppression d'un post (auteur uniquement). Les interactions partent en
/// cascade ; le média joint est nettoyé (ligne + fichier sur disque).
async fn delete_post(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT author_id, media_id FROM posts WHERE id = $1 AND space_id = $2",
    )
    .bind(post_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    let (author_id, media_id) = row.ok_or(ApiError::NotFound)?;
    if author_id != auth.user_id {
        return Err(ApiError::Forbidden);
    }

    sqlx::query("DELETE FROM posts WHERE id = $1 AND space_id = $2")
        .bind(post_id)
        .bind(space_id)
        .execute(&state.pool)
        .await?;

    if let Some(mid) = media_id {
        let key: Option<String> =
            sqlx::query_scalar("DELETE FROM media WHERE id = $1 RETURNING storage_key")
                .bind(mid)
                .fetch_optional(&state.pool)
                .await?;
        if let Some(key) = key {
            let _ = tokio::fs::remove_file(FsPath::new(&state.config.media_dir).join(key)).await;
        }
    }

    state.emit(space_id, auth.user_id, EventKind::Post);
    Ok(StatusCode::NO_CONTENT)
}

/// Met à jour un post (auteur uniquement) : édition du titre/récit (brouillon
/// seulement) et/ou changement du statut brouillon. Publier un brouillon
/// (draft true -> false) déclenche la notification, comme une création.
async fn update_post(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, post_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdatePostBody>,
) -> ApiResult<Json<Post>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let current: Option<(Uuid, Option<String>, String, Option<Uuid>, bool)> = sqlx::query_as(
        "SELECT author_id, title, body, media_id, draft FROM posts WHERE id = $1 AND space_id = $2",
    )
    .bind(post_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    let (author_id, cur_title, cur_body, cur_media, was_draft) =
        current.ok_or(ApiError::NotFound)?;
    if author_id != auth.user_id {
        return Err(ApiError::Forbidden);
    }

    // L'auteur peut éditer le contenu d'un post (brouillon comme publié).
    let new_title = match &body.title {
        Some(t) => {
            let t = t.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        None => cur_title,
    };
    let new_body = match &body.body {
        Some(b) => b.trim().to_string(),
        None => cur_body,
    };

    // Média : retrait explicite, remplacement, ou inchangé.
    let new_media = if body.clear_media {
        None
    } else {
        body.media_id.or(cur_media)
    };
    // Un post peut être un simple média : on exige un récit OU un média.
    if new_body.is_empty() && new_media.is_none() {
        return Err(ApiError::BadRequest(
            "un récit ou un média est requis".into(),
        ));
    }
    // Un média nouvellement attaché doit appartenir au même espace.
    if let Some(mid) = body.media_id {
        if Some(mid) != cur_media {
            let ok: Option<Uuid> =
                sqlx::query_scalar("SELECT id FROM media WHERE id = $1 AND space_id = $2")
                    .bind(mid)
                    .bind(space_id)
                    .fetch_optional(&state.pool)
                    .await?;
            if ok.is_none() {
                return Err(ApiError::BadRequest("média introuvable pour cet espace".into()));
            }
        }
    }

    let new_draft = body.draft.unwrap_or(was_draft);

    let row: PostRow = sqlx::query_as(
        "WITH updated AS (
             UPDATE posts SET title = $3, body = $4, media_id = $5, draft = $6
             WHERE id = $1 AND space_id = $2
             RETURNING id, author_id, title, body, media_id, draft, created_at
         )
         SELECT up.id, up.author_id, u.display_name AS author_name,
                up.title, up.body, up.media_id, m.view_once AS media_view_once,
                m.consumed AS media_consumed, m.mime AS media_mime, up.draft, up.created_at
         FROM updated up
         JOIN users u ON u.id = up.author_id
         LEFT JOIN media m ON m.id = up.media_id",
    )
    .bind(post_id)
    .bind(space_id)
    .bind(new_title.as_deref())
    .bind(&new_body)
    .bind(new_media)
    .bind(new_draft)
    .fetch_one(&state.pool)
    .await?;

    // Ancien média remplacé/retiré : nettoyage (ligne + fichier disque).
    if let Some(old) = cur_media {
        if Some(old) != new_media {
            let key: Option<String> =
                sqlx::query_scalar("DELETE FROM media WHERE id = $1 RETURNING storage_key")
                    .bind(old)
                    .fetch_optional(&state.pool)
                    .await?;
            if let Some(key) = key {
                let _ =
                    tokio::fs::remove_file(FsPath::new(&state.config.media_dir).join(key)).await;
            }
        }
    }

    let post = enrich_one(&state.pool, row, auth.user_id).await?;
    // Le partenaire rafraîchit si le post est (devenu) visible : publié, ou
    // statut changé (publication/remise en brouillon). Éditer un brouillon qui
    // reste brouillon ne concerne que l'auteur.
    if !post.draft || post.draft != was_draft {
        state.emit(space_id, auth.user_id, EventKind::Post);
    }
    if was_draft && !post.draft {
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "Nouveau message".into(),
        );
    }
    Ok(Json(post))
}
