use axum::body::Body;
use axum::extract::{Multipart, Path, State};
use axum::http::header::CONTENT_TYPE;
use axum::http::HeaderValue;
use axum::response::Response;
use axum::routing::post;
use axum::{Json, Router};
use serde::Serialize;
use std::path::PathBuf;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::Media;
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/media", post(upload))
        .route("/api/spaces/{id}/media/{mid}", axum::routing::get(stream))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCreated {
    pub id: Uuid,
    pub mime: String,
    pub view_once: bool,
}

fn media_path(dir: &str, key: &str) -> PathBuf {
    PathBuf::from(dir).join(key)
}

/// Upload multipart : le fichier est stocké HORS de tout dossier public,
/// sous un nom UUID. La table `media` garde le mime et le flag view_once.
async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    mut multipart: Multipart,
) -> ApiResult<Json<MediaCreated>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let mut data: Option<(Vec<u8>, String)> = None;
    let mut view_once = false;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("multipart invalide".into()))?
    {
        match field.name() {
            Some("file") => {
                let mime = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("lecture du fichier échouée".into()))?;
                data = Some((bytes.to_vec(), mime));
            }
            Some("viewOnce") => {
                let v = field.text().await.unwrap_or_default();
                view_once = v == "true" || v == "1";
            }
            _ => {}
        }
    }

    let (bytes, mime) = data.ok_or(ApiError::BadRequest("champ 'file' manquant".into()))?;

    let storage_key = Uuid::new_v4().to_string();
    tokio::fs::create_dir_all(&state.config.media_dir)
        .await
        .map_err(|_| ApiError::Internal)?;
    tokio::fs::write(media_path(&state.config.media_dir, &storage_key), &bytes)
        .await
        .map_err(|_| ApiError::Internal)?;

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO media (space_id, owner_id, storage_key, mime, view_once)
         VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&storage_key)
    .bind(&mime)
    .bind(view_once)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(MediaCreated { id, mime, view_once }))
}

/// Lecture authentifiée : vérifie l'appartenance au space puis stream les octets.
/// Aucun accès direct au fichier n'est possible sans passer par cette garde.
async fn stream(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, media_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Response> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    let media: Option<Media> = sqlx::query_as(
        "SELECT id, storage_key, mime, view_once, consumed
         FROM media WHERE id = $1 AND space_id = $2",
    )
    .bind(media_id)
    .bind(space_id)
    .fetch_optional(&state.pool)
    .await?;
    let media = media.ok_or(ApiError::NotFound)?;

    if media.consumed {
        // Média éphémère déjà ouvert : envolé.
        return Err(ApiError::NotFound);
    }

    let path = media_path(&state.config.media_dir, &media.storage_key);
    let content_type =
        HeaderValue::from_str(&media.mime).map_err(|_| ApiError::Internal)?;

    if media.view_once {
        // On lit, on supprime le fichier et on marque consommé : une seule lecture.
        let bytes = tokio::fs::read(&path).await.map_err(|_| ApiError::NotFound)?;
        let _ = tokio::fs::remove_file(&path).await;
        sqlx::query("UPDATE media SET consumed = true WHERE id = $1")
            .bind(media.id)
            .execute(&state.pool)
            .await?;

        let mut resp = Response::new(Body::from(bytes));
        resp.headers_mut().insert(CONTENT_TYPE, content_type);
        return Ok(resp);
    }

    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| ApiError::NotFound)?;
    let mut resp = Response::new(Body::from_stream(ReaderStream::new(file)));
    resp.headers_mut().insert(CONTENT_TYPE, content_type);
    Ok(resp)
}
