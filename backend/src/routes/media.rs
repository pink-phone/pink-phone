use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use axum::body::Body;
use axum::extract::{Multipart, Path, State};
use axum::http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::post;
use axum::{Json, Router};
use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use std::io::SeekFrom;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
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

/// Plage `Range` demandée, bornes inclusives.
enum RangeReq {
    /// Aucun en-tête `Range` (ou ignoré) → ressource entière.
    Full,
    /// Plage satisfiable `start..=end`.
    Partial(u64, u64),
    /// En-tête présent mais non satisfiable → 416.
    Unsatisfiable,
}

/// Parse un en-tête `Range: bytes=…` simple (une seule plage) pour `total` octets.
/// On gère `bytes=a-b`, `bytes=a-` et `bytes=-n` (suffixe). Tout le reste = Full.
fn parse_range(headers: &HeaderMap, total: u64) -> RangeReq {
    let Some(raw) = headers.get(RANGE) else {
        return RangeReq::Full;
    };
    let Some(spec) = raw.to_str().ok().and_then(|s| s.strip_prefix("bytes=")) else {
        return RangeReq::Unsatisfiable;
    };
    // Plages multiples non gérées : on sert la ressource entière (réponse 200 valide).
    if spec.contains(',') {
        return RangeReq::Full;
    }
    let Some((a, b)) = spec.split_once('-') else {
        return RangeReq::Unsatisfiable;
    };
    if total == 0 {
        return RangeReq::Unsatisfiable;
    }
    let (start, end) = if a.is_empty() {
        // Suffixe : les n derniers octets.
        match b.parse::<u64>() {
            Ok(0) | Err(_) => return RangeReq::Unsatisfiable,
            Ok(n) => (total.saturating_sub(n.min(total)), total - 1),
        }
    } else {
        let Ok(start) = a.parse::<u64>() else {
            return RangeReq::Unsatisfiable;
        };
        let end = if b.is_empty() {
            total - 1
        } else {
            match b.parse::<u64>() {
                Ok(e) => e.min(total - 1),
                Err(_) => return RangeReq::Unsatisfiable,
            }
        };
        (start, end)
    };
    if start > end || start >= total {
        return RangeReq::Unsatisfiable;
    }
    RangeReq::Partial(start, end)
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
    headers: HeaderMap,
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
    let media = media.ok_or_else(|| {
        tracing::warn!(%media_id, %space_id, "média introuvable (ligne absente)");
        ApiError::NotFound
    })?;

    if media.consumed {
        // Média éphémère déjà ouvert : envolé (attendu, pas une erreur).
        tracing::debug!(%media_id, "média éphémère déjà consommé");
        return Err(ApiError::NotFound);
    }

    let path = media_path(&state.config.media_dir, &media.storage_key);
    let content_type =
        HeaderValue::from_str(&media.mime).map_err(|_| ApiError::Internal)?;

    // view_once et chiffré : on doit lire le fichier entier en mémoire (le GCM
    // s'authentifie sur tout le blob ; le view_once se consomme après lecture).
    // Le Range est honoré en tranchant le tampon déjà déchiffré.
    if media.view_once || media.encrypted {
        let raw = tokio::fs::read(&path).await.map_err(|e| {
            tracing::error!(%media_id, key = %media.storage_key, error = ?e,
                "lecture du fichier média échouée (absent sur disque ?)");
            ApiError::NotFound
        })?;
        let bytes = if media.encrypted {
            let key = state.config.media_key_bytes().ok_or_else(|| {
                tracing::error!(%media_id,
                    "média chiffré mais MEDIA_KEY absente/invalide à la lecture");
                ApiError::Internal
            })?;
            decrypt(&key, &raw).ok_or_else(|| {
                tracing::error!(%media_id,
                    "déchiffrement AES échoué (MEDIA_KEY a-t-elle changé ?)");
                ApiError::Internal
            })?
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

        let total = bytes.len() as u64;
        return Ok(match parse_range(&headers, total) {
            RangeReq::Unsatisfiable => unsatisfiable_response(total),
            RangeReq::Full => {
                let mut resp = Response::new(Body::from(bytes));
                base_headers(resp.headers_mut(), content_type, total);
                resp
            }
            RangeReq::Partial(start, end) => {
                let slice = bytes[start as usize..=end as usize].to_vec();
                partial_response(slice, content_type, start, end, total)
            }
        });
    }

    // Média en clair : on stream depuis le disque sans charger le fichier entier
    // en mémoire (nginx ne bufferise plus la réponse dans un fichier temporaire).
    let meta = tokio::fs::metadata(&path).await.map_err(|e| {
        tracing::error!(%media_id, key = %media.storage_key, error = ?e,
            "stat du fichier média échouée (absent sur disque ?)");
        ApiError::NotFound
    })?;
    let total = meta.len();
    let mut file = tokio::fs::File::open(&path).await.map_err(|e| {
        tracing::error!(%media_id, key = %media.storage_key, error = ?e,
            "ouverture du fichier média échouée");
        ApiError::NotFound
    })?;

    Ok(match parse_range(&headers, total) {
        RangeReq::Unsatisfiable => unsatisfiable_response(total),
        RangeReq::Full => {
            let body = Body::from_stream(ReaderStream::new(file));
            let mut resp = Response::new(body);
            base_headers(resp.headers_mut(), content_type, total);
            resp
        }
        RangeReq::Partial(start, end) => {
            if file.seek(SeekFrom::Start(start)).await.is_err() {
                return Err(ApiError::Internal);
            }
            let len = end - start + 1;
            let body = Body::from_stream(ReaderStream::new(file.take(len)));
            let mut resp = Response::new(body);
            resp.headers_mut().insert(CONTENT_TYPE, content_type);
            common_headers(resp.headers_mut(), len);
            *resp.status_mut() = StatusCode::PARTIAL_CONTENT;
            if let Ok(cr) =
                HeaderValue::from_str(&format!("bytes {start}-{end}/{total}"))
            {
                resp.headers_mut().insert(CONTENT_RANGE, cr);
            }
            resp
        }
    })
}

/// En-têtes communs à toutes les réponses média (cache + Accept-Ranges + taille).
fn common_headers(h: &mut HeaderMap, content_length: u64) {
    // Médias intimes : jamais mis en cache disque par le navigateur (#34).
    h.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    h.insert(CONTENT_LENGTH, HeaderValue::from(content_length));
}

/// En-têtes d'une réponse 200 complète.
fn base_headers(h: &mut HeaderMap, content_type: HeaderValue, total: u64) {
    h.insert(CONTENT_TYPE, content_type);
    common_headers(h, total);
}

/// Réponse 206 servie depuis un tampon en mémoire (view_once / chiffré).
fn partial_response(
    slice: Vec<u8>,
    content_type: HeaderValue,
    start: u64,
    end: u64,
    total: u64,
) -> Response {
    let len = slice.len() as u64;
    let mut resp = Response::new(Body::from(slice));
    resp.headers_mut().insert(CONTENT_TYPE, content_type);
    common_headers(resp.headers_mut(), len);
    *resp.status_mut() = StatusCode::PARTIAL_CONTENT;
    if let Ok(cr) = HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")) {
        resp.headers_mut().insert(CONTENT_RANGE, cr);
    }
    resp
}

/// Réponse 416 (Range non satisfiable) avec `Content-Range: bytes */total`.
fn unsatisfiable_response(total: u64) -> Response {
    let mut resp = Response::new(Body::empty());
    *resp.status_mut() = StatusCode::RANGE_NOT_SATISFIABLE;
    resp.headers_mut()
        .insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if let Ok(cr) = HeaderValue::from_str(&format!("bytes */{total}")) {
        resp.headers_mut().insert(CONTENT_RANGE, cr);
    }
    resp
}

#[cfg(test)]
mod tests {
    use super::*;

    fn range(spec: &str, total: u64) -> RangeReq {
        let mut h = HeaderMap::new();
        h.insert(RANGE, HeaderValue::from_str(spec).unwrap());
        parse_range(&h, total)
    }

    #[test]
    fn sans_header_full() {
        assert!(matches!(parse_range(&HeaderMap::new(), 100), RangeReq::Full));
    }

    #[test]
    fn plages_satisfiables() {
        assert!(matches!(range("bytes=0-99", 1000), RangeReq::Partial(0, 99)));
        assert!(matches!(range("bytes=100-", 1000), RangeReq::Partial(100, 999)));
        // Suffixe : les 50 derniers octets.
        assert!(matches!(range("bytes=-50", 1000), RangeReq::Partial(950, 999)));
        // `end` au-delà de la taille => borné à total-1.
        assert!(matches!(range("bytes=0-100000", 1000), RangeReq::Partial(0, 999)));
    }

    #[test]
    fn plages_non_satisfiables() {
        assert!(matches!(range("bytes=2000-3000", 1000), RangeReq::Unsatisfiable));
        assert!(matches!(range("bytes=abc", 1000), RangeReq::Unsatisfiable));
        assert!(matches!(range("bytes=-0", 1000), RangeReq::Unsatisfiable));
        // Ressource vide : aucune plage n'est satisfiable.
        assert!(matches!(range("bytes=0-0", 0), RangeReq::Unsatisfiable));
    }

    #[test]
    fn chiffrement_roundtrip() {
        let key = [7u8; 32];
        let msg = b"un message intime";
        let blob = encrypt(&key, msg).expect("chiffrement");
        assert_ne!(&blob[..], &msg[..]); // bien chiffré
        assert_eq!(decrypt(&key, &blob).expect("déchiffrement"), msg);
    }

    #[test]
    fn dechiffrement_echoue_si_mauvaise_cle_ou_blob_court() {
        let key = [7u8; 32];
        let blob = encrypt(&key, b"secret").unwrap();
        assert!(decrypt(&[9u8; 32], &blob).is_none()); // GCM rejette
        assert!(decrypt(&key, b"court").is_none()); // < 12 octets de nonce
    }
}
