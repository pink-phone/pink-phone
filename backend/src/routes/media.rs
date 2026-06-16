use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use axum::body::Body;
use axum::extract::{Multipart, Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::HeaderValue;
use axum::response::Response;
use axum::routing::post;
use axum::{Json, Router};
use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use std::path::PathBuf;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::Media;
use crate::routes::ensure_member;
use crate::state::AppState;

/// Chiffre `plaintext` en AES-256-GCM ; renvoie nonce(12o) ++ ciphertext.
fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Option<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher.encrypt(Nonce::from_slice(&nonce), plaintext).ok()?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Some(out)
}

/// Déchiffre un blob nonce(12o) ++ ciphertext produit par `encrypt`.
fn decrypt(key: &[u8; 32], blob: &[u8]) -> Option<Vec<u8>> {
    if blob.len() < 12 {
        return None;
    }
    let (nonce, ct) = blob.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(Nonce::from_slice(nonce), ct).ok()
}

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

/// Purge les médias orphelins : uploadés mais rattachés à aucun post, et
/// vieux de plus d'une heure (laisse le temps de finaliser une publication).
/// Supprime la ligne en base et le fichier sur disque.
pub async fn purge_orphan_media(pool: &sqlx::PgPool, media_dir: &str) {
    let rows: Vec<(Uuid, String)> = match sqlx::query_as(
        "DELETE FROM media m
         WHERE m.created_at < now() - interval '1 hour'
           AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.media_id = m.id)
         RETURNING m.id, m.storage_key",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = ?e, "purge des médias orphelins échouée");
            return;
        }
    };
    for (_, key) in &rows {
        let _ = tokio::fs::remove_file(media_path(media_dir, key)).await;
    }
    if !rows.is_empty() {
        tracing::info!(count = rows.len(), "médias orphelins purgés");
    }
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

    // Chiffrement au repos si une clé est configurée (sinon stockage en clair).
    let (to_write, encrypted) = match state.config.media_key_bytes() {
        Some(key) => (encrypt(&key, &bytes).ok_or(ApiError::Internal)?, true),
        None => (bytes, false),
    };

    let storage_key = Uuid::new_v4().to_string();
    tokio::fs::create_dir_all(&state.config.media_dir)
        .await
        .map_err(|_| ApiError::Internal)?;
    tokio::fs::write(media_path(&state.config.media_dir, &storage_key), &to_write)
        .await
        .map_err(|_| ApiError::Internal)?;

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO media (space_id, owner_id, storage_key, mime, view_once, encrypted)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&storage_key)
    .bind(&mime)
    .bind(view_once)
    .bind(encrypted)
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
        "SELECT id, storage_key, mime, view_once, consumed, encrypted
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

    // Lecture complète (nécessaire pour déchiffrer le GCM), puis déchiffrement.
    let raw = tokio::fs::read(&path).await.map_err(|_| ApiError::NotFound)?;
    let bytes = if media.encrypted {
        let key = state.config.media_key_bytes().ok_or(ApiError::Internal)?;
        decrypt(&key, &raw).ok_or(ApiError::Internal)?
    } else {
        raw
    };

    if media.view_once {
        // Une seule lecture : on supprime le fichier et on marque consommé.
        let _ = tokio::fs::remove_file(&path).await;
        sqlx::query("UPDATE media SET consumed = true WHERE id = $1")
            .bind(media.id)
            .execute(&state.pool)
            .await?;
    }

    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut().insert(CONTENT_TYPE, content_type);
    // Médias intimes : jamais mis en cache disque par le navigateur (#34).
    resp.headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(resp)
}
