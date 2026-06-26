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
use crate::models::{Post, PostMediaItem, PostMediaRow, PostRow};
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

// Bornes hautes des champs texte (RR-02) — seul plafond sinon = body limit 100 Mo.
const MAX_TITLE_LEN: usize = 200;
const MAX_BODY_LEN: usize = 64 * 1024;
/// Nombre max de médias par post (galerie #87).
const MAX_MEDIA: usize = 10;

/// Valide titre + récit d'un post (longueurs). Le « vide vs média » est géré à part.
fn validate_post_text(title: Option<&str>, body: &str) -> ApiResult<()> {
    if title.map(str::trim).map(str::len).unwrap_or(0) > MAX_TITLE_LEN {
        return Err(ApiError::BadRequest("titre trop long".into()));
    }
    if body.len() > MAX_BODY_LEN {
        return Err(ApiError::BadRequest("récit trop long".into()));
    }
    Ok(())
}

/// Vérifie le nombre (≤ MAX_MEDIA) et que chaque média appartient à l'espace (#87).
async fn validate_media(
    pool: &sqlx::PgPool,
    space_id: Uuid,
    ids: &[Uuid],
) -> ApiResult<()> {
    if ids.len() > MAX_MEDIA {
        return Err(ApiError::BadRequest("trop de médias".into()));
    }
    for id in ids {
        let ok: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM media WHERE id = $1 AND space_id = $2")
                .bind(id)
                .bind(space_id)
                .fetch_optional(pool)
                .await?;
        if ok.is_none() {
            return Err(ApiError::BadRequest("média introuvable pour cet espace".into()));
        }
    }
    Ok(())
}

/// (Ré)écrit la galerie d'un post : purge les liens existants puis insère la liste
/// ordonnée (#87). Ne nettoie PAS les fichiers orphelins (cf. `cleanup_unreferenced`
/// + purge horaire).
async fn set_post_media(
    pool: &sqlx::PgPool,
    post_id: Uuid,
    ids: &[Uuid],
) -> ApiResult<()> {
    sqlx::query("DELETE FROM post_media WHERE post_id = $1")
        .bind(post_id)
        .execute(pool)
        .await?;
    for (i, id) in ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO post_media (post_id, media_id, position) VALUES ($1, $2, $3)",
        )
        .bind(post_id)
        .bind(id)
        .bind(i as i32)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// Supprime ligne média + fichier disque pour les médias plus référencés par
/// AUCUN post (après un retrait/suppression). Best-effort.
async fn cleanup_unreferenced(pool: &sqlx::PgPool, media_dir: &str, ids: &[Uuid]) {
    for id in ids {
        let key: Option<String> = sqlx::query_scalar(
            "DELETE FROM media WHERE id = $1
               AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = $1)
             RETURNING storage_key",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
        if let Some(key) = key {
            let _ = tokio::fs::remove_file(FsPath::new(media_dir).join(key)).await;
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostBody {
    pub title: Option<String>,
    pub body: String,
    /// Galerie ordonnée (#87) : 0..MAX_MEDIA médias, déjà uploadés, dans l'ordre.
    #[serde(default)]
    pub media_ids: Vec<Uuid>,
    /// Brouillon : visible du seul auteur, sans notification.
    #[serde(default)]
    pub draft: bool,
    /// Médias téléchargeables (#78). Absent ⇒ on prend le défaut du salon.
    pub allow_download: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePostBody {
    /// Présent ⇒ remplace le titre (vide ⇒ supprime). Absent ⇒ inchangé.
    /// Réservé aux brouillons.
    pub title: Option<String>,
    /// Présent ⇒ remplace le récit. Absent ⇒ inchangé. Réservé aux brouillons.
    pub body: Option<String>,
    /// Présent ⇒ remplace TOUTE la galerie par cette liste ordonnée (#87) ;
    /// `[]` la vide. Absent ⇒ inchangée.
    pub media_ids: Option<Vec<Uuid>>,
    /// Publication d'un brouillon (`false`) ou remise en brouillon (`true`).
    pub draft: Option<bool>,
    /// Présent ⇒ change l'autorisation de téléchargement du média (#78).
    pub allow_download: Option<bool>,
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

    // Mes favoris parmi ces posts (marque-page personnel, #96).
    let favorite_ids: std::collections::HashSet<Uuid> = sqlx::query_scalar(
        "SELECT post_id FROM post_favorites WHERE post_id = ANY($1) AND user_id = $2",
    )
    .bind(&ids)
    .bind(user_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .collect();

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

    // Galerie de médias par post (#87), ordonnée par `position`.
    let media_rows: Vec<PostMediaRow> = sqlx::query_as(
        "SELECT pm.post_id, m.id, m.mime, m.view_once, m.consumed
         FROM post_media pm JOIN media m ON m.id = pm.media_id
         WHERE pm.post_id = ANY($1)
         ORDER BY pm.post_id, pm.position, m.created_at",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    let mut media_by_post: HashMap<Uuid, Vec<PostMediaItem>> = HashMap::new();
    for r in media_rows {
        media_by_post.entry(r.post_id).or_default().push(PostMediaItem {
            id: r.id,
            mime: r.mime,
            view_once: r.view_once,
            consumed: r.consumed,
        });
    }

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
            is_favorite: favorite_ids.contains(&p.id),
            comment_count: comments_by_post.get(&p.id).copied().unwrap_or(0),
            last_comment_at: last_comment_by_post.get(&p.id).copied(),
            id: p.id,
            author_id: p.author_id,
            author_name: p.author_name,
            title: p.title,
            body: p.body,
            media: media_by_post.remove(&p.id).unwrap_or_default(),
            draft: p.draft,
            allow_download: p.allow_download,
            created_at: p.created_at,
            updated_at: p.updated_at,
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
                p.title, p.body, p.draft, p.allow_download,
                p.created_at, p.updated_at
         FROM posts p
         JOIN users u ON u.id = p.author_id
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
    validate_post_text(body.title.as_deref(), &body.body)?;
    // Un post peut être un simple média : on exige un récit OU au moins un média.
    if body.body.trim().is_empty() && body.media_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "un récit ou un média est requis".into(),
        ));
    }
    // Chaque média de la galerie doit appartenir à l'espace (et nombre borné).
    validate_media(&state.pool, space_id, &body.media_ids).await?;

    let row: PostRow = sqlx::query_as(
        // Téléchargeable : valeur explicite du post sinon le défaut du salon
        // (#78), résolu en sous-requête plutôt qu'un SELECT séparé (RR-07).
        "WITH inserted AS (
             INSERT INTO posts (space_id, author_id, title, body, draft, allow_download)
             VALUES ($1, $2, $3, $4, $5,
                     COALESCE($6, (SELECT allow_media_download FROM spaces WHERE id = $1)))
             RETURNING id, author_id, title, body, draft, allow_download, created_at, updated_at
         )
         SELECT i.id, i.author_id, u.display_name AS author_name,
                i.title, i.body, i.draft, i.allow_download, i.created_at, i.updated_at
         FROM inserted i JOIN users u ON u.id = i.author_id",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(body.title.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.body.trim())
    .bind(body.draft)
    .bind(body.allow_download)
    .fetch_one(&state.pool)
    .await?;

    // Galerie ordonnée (#87).
    set_post_media(&state.pool, row.id, &body.media_ids).await?;

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

    let author_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT author_id FROM posts WHERE id = $1 AND space_id = $2",
    )
    .bind(post_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    if author_id.ok_or(ApiError::NotFound)? != auth.user_id {
        return Err(ApiError::Forbidden);
    }

    // Médias de la galerie à nettoyer après suppression du post (#87).
    let media_ids: Vec<Uuid> =
        sqlx::query_scalar("SELECT media_id FROM post_media WHERE post_id = $1")
            .bind(post_id)
            .fetch_all(&state.pool)
            .await?;

    // `author_id` dans le WHERE (RR-03) : suppression atomique avec la garde de
    // propriété (calqué sur delete_comment). Cascade → les liens post_media partent.
    sqlx::query("DELETE FROM posts WHERE id = $1 AND space_id = $2 AND author_id = $3")
        .bind(post_id)
        .bind(space_id)
        .bind(auth.user_id)
        .execute(&state.pool)
        .await?;

    cleanup_unreferenced(&state.pool, &state.config.media_dir, &media_ids).await;

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

    let current: Option<(Uuid, Option<String>, String, bool)> = sqlx::query_as(
        "SELECT author_id, title, body, draft FROM posts WHERE id = $1 AND space_id = $2",
    )
    .bind(post_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    let (author_id, cur_title, cur_body, was_draft) =
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
    validate_post_text(new_title.as_deref(), &new_body)?;

    // Galerie (#87) : `media_ids` présent ⇒ remplace toute la liste ; absent ⇒
    // inchangée. On lit l'état courant pour le check « vide » et le nettoyage.
    let cur_media_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT media_id FROM post_media WHERE post_id = $1 ORDER BY position",
    )
    .bind(post_id)
    .fetch_all(&state.pool)
    .await?;
    let new_media_ids: Vec<Uuid> =
        body.media_ids.clone().unwrap_or_else(|| cur_media_ids.clone());
    // Un post peut être un simple média : on exige un récit OU au moins un média.
    if new_body.is_empty() && new_media_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "un récit ou un média est requis".into(),
        ));
    }
    if body.media_ids.is_some() {
        validate_media(&state.pool, space_id, &new_media_ids).await?;
    }

    let new_draft = body.draft.unwrap_or(was_draft);
    // `updated_at` ne bouge que si le CONTENU change (API-10) : une simple
    // publication de brouillon (`{draft:false}` seul) n'est pas une « édition »
    // et ne doit pas marquer le post comme modifié.
    let content_changed =
        body.title.is_some() || body.body.is_some() || body.media_ids.is_some();
    // Publication d'un brouillon (brouillon → publié) : le post « naît » dans le
    // fil à cet instant → on repositionne created_at (et updated_at, pour ne pas
    // le marquer « modifié ») sur now(). Sinon il garderait la date de création
    // du brouillon et s'insérerait au mauvais endroit / fausserait les badges
    // « nouveau » et les accusés de lecture, tous indexés sur created_at (B-E/B-F).
    let publishing = was_draft && !new_draft;

    let row: PostRow = sqlx::query_as(
        "WITH updated AS (
             UPDATE posts SET title = $3, body = $4, draft = $5,
                              allow_download = COALESCE($8, allow_download),
                              created_at = CASE WHEN $7 THEN now() ELSE created_at END,
                              updated_at = CASE WHEN ($6 OR $7) THEN now() ELSE updated_at END
             WHERE id = $1 AND space_id = $2 AND author_id = $9
             RETURNING id, author_id, title, body, draft, allow_download, created_at, updated_at
         )
         SELECT up.id, up.author_id, u.display_name AS author_name,
                up.title, up.body, up.draft, up.allow_download,
                up.created_at, up.updated_at
         FROM updated up JOIN users u ON u.id = up.author_id",
    )
    .bind(post_id)
    .bind(space_id)
    .bind(new_title.as_deref())
    .bind(&new_body)
    .bind(new_draft)
    .bind(content_changed)
    .bind(publishing)
    .bind(body.allow_download)
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await?;

    // Galerie remplacée (#87) : on réécrit l'ordre puis on nettoie les médias
    // retirés (plus référencés par aucun post).
    if body.media_ids.is_some() {
        set_post_media(&state.pool, post_id, &new_media_ids).await?;
        let removed: Vec<Uuid> = cur_media_ids
            .iter()
            .filter(|id| !new_media_ids.contains(id))
            .copied()
            .collect();
        cleanup_unreferenced(&state.pool, &state.config.media_dir, &removed).await;
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
