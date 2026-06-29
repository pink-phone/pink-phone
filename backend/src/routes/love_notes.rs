use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::LoveNote;
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

// Boîte à « mots doux » (#102) : petits post-it sur l'accueil, avec ouverture
// différée optionnelle. Le scellage (corps caché jusqu'à `open_at`) est appliqué
// CÔTÉ SERVEUR — le corps n'est jamais envoyé au/à la destinataire avant l'heure.

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/spaces/{id}/love-notes",
            get(list_notes).post(create_note),
        )
        .route(
            "/api/spaces/{id}/love-notes/{nid}",
            axum::routing::delete(delete_note),
        )
}

/// Borne du corps d'un mot doux (court par nature).
const MAX_NOTE_LEN: usize = 2000;

#[derive(sqlx::FromRow)]
struct NoteRow {
    id: Uuid,
    author_id: Uuid,
    author_name: String,
    body: String,
    open_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

/// Applique le scellage du point de vue de `me` : un mot à ouverture différée non
/// échue, écrit par quelqu'un d'autre, masque son corps (`sealed`).
fn to_view(row: NoteRow, me: Uuid, now: DateTime<Utc>) -> LoveNote {
    let sealed = row.author_id != me && row.open_at.is_some_and(|t| t > now);
    LoveNote {
        id: row.id,
        author_id: row.author_id,
        author_name: row.author_name,
        body: if sealed { None } else { Some(row.body) },
        sealed,
        open_at: row.open_at,
        created_at: row.created_at,
    }
}

async fn list_notes(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<LoveNote>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let rows: Vec<NoteRow> = sqlx::query_as(
        "SELECT n.id, n.author_id, u.display_name AS author_name, n.body,
                n.open_at, n.created_at
         FROM love_notes n JOIN users u ON u.id = n.author_id
         WHERE n.space_id = $1
         ORDER BY n.created_at DESC
         LIMIT 100",
    )
    .bind(space_id)
    .fetch_all(&state.pool)
    .await?;
    let now = Utc::now();
    let notes = rows
        .into_iter()
        .map(|r| to_view(r, auth.user_id, now))
        .collect();
    Ok(Json(notes))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteBody {
    pub body: String,
    /// Ouverture différée optionnelle ; passée/absente ⇒ mot immédiat.
    pub open_at: Option<DateTime<Utc>>,
}

async fn create_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<CreateNoteBody>,
) -> ApiResult<(StatusCode, Json<LoveNote>)> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let text = body.body.trim();
    if text.is_empty() {
        return Err(ApiError::BadRequest("mot vide".into()));
    }
    if text.chars().count() > MAX_NOTE_LEN {
        return Err(ApiError::BadRequest("mot trop long".into()));
    }
    let now = Utc::now();
    // Une date d'ouverture dans le passé est traitée comme un mot immédiat.
    let open_at = body.open_at.filter(|t| *t > now);

    let row: NoteRow = sqlx::query_as(
        "WITH inserted AS (
             INSERT INTO love_notes (space_id, author_id, body, open_at)
             VALUES ($1, $2, $3, $4)
             RETURNING id, author_id, body, open_at, created_at
         )
         SELECT i.id, i.author_id, u.display_name AS author_name, i.body,
                i.open_at, i.created_at
         FROM inserted i JOIN users u ON u.id = i.author_id",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(text)
    .bind(open_at)
    .fetch_one(&state.pool)
    .await?;

    // Le/la partenaire rafraîchit dans tous les cas (un mot différé fait apparaître
    // un teaser scellé). Push immédiat SEULEMENT pour un mot non différé — un mot
    // différé est poussé à son échéance par la tâche planifiée (#102).
    state.emit(space_id, auth.user_id, EventKind::LoveNote);
    if open_at.is_none() {
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "Un mot doux pour toi".into(),
        );
    }

    let note = to_view(row, auth.user_id, now);
    Ok((StatusCode::CREATED, Json(note)))
}

async fn delete_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, note_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    // Auteur·e uniquement (WHERE author_id) : 0 ligne ⇒ inexistant ou pas le mien.
    let deleted: Option<Uuid> = sqlx::query_scalar(
        "DELETE FROM love_notes
         WHERE id = $1 AND space_id = $2 AND author_id = $3
         RETURNING id",
    )
    .bind(note_id)
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_optional(&state.pool)
    .await?;
    deleted.ok_or(ApiError::NotFound)?;
    state.emit(space_id, auth.user_id, EventKind::LoveNote);
    Ok(StatusCode::NO_CONTENT)
}

/// Livre les mots doux différés arrivés à échéance : push best-effort aux
/// destinataires (tout sauf l'auteur·e), une seule fois (`notified`). Appelée par
/// la tâche horaire — granularité ~1 h, acceptable pour des mots doux (#102).
pub async fn deliver_due_notes(state: &AppState) {
    // Réclame les mots échus non encore notifiés (atomique : marque puis pousse).
    let due: Vec<(Uuid, Uuid)> = match sqlx::query_as(
        "UPDATE love_notes SET notified = true
         WHERE open_at IS NOT NULL AND open_at <= now() AND notified = false
         RETURNING space_id, author_id",
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!(error = ?e, "livraison des mots doux échouée");
            return;
        }
    };
    for (space_id, author_id) in due {
        crate::notifications::notify_members(
            state,
            space_id,
            author_id,
            "Un mot doux t'attend".into(),
        );
    }
}
