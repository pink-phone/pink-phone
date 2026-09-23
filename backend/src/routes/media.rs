use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use axum::body::{Body, Bytes};
use axum::extract::{Multipart, Path, State};
use axum::http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::post;
use axum::{Json, Router};
use little_exif::exif_tag::ExifTag;
use little_exif::filetype::FileExtension;
use little_exif::metadata::Metadata as ExifMetadata;
use rand::rngs::SysRng;
use rand::TryRng;
use serde::Serialize;
use std::io::{Cursor, SeekFrom};
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::Media;
use crate::rate_limit::ClientIp;
use crate::routes::ensure_member;
use crate::state::AppState;

/// Rate limiting de l'upload (SECURITY_FINDINGS.md #13) : rien ne bornait le
/// nombre d'uploads par unité de temps — un membre authentifié (légitime, ou
/// via une invitation qu'il a fait fuiter) pouvait enchaîner des requêtes de
/// 100 Mo (`DefaultBodyLimit`, main.rs) sans aucune limite de fréquence et
/// remplir le disque du serveur (CWE-400). Plafond généreux (une galerie
/// complète, MAX_MEDIA = 10, tient dans une seule fenêtre) : ce n'est pas une
/// garantie de quota disque total, juste un frein contre l'abus automatisé.
const UPLOAD_MAX_ATTEMPTS: usize = 30;
const UPLOAD_WINDOW: Duration = Duration::from_secs(60);

/// Chiffre `plaintext` en AES-256-GCM ; renvoie nonce(12o) ++ ciphertext.
pub(crate) fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Option<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12];
    // Source OS ; en cas d'échec du RNG système on refuse de chiffrer plutôt que
    // d'utiliser un nonce nul/répété (catastrophique pour AES-GCM).
    SysRng.try_fill_bytes(&mut nonce).ok()?;
    let ct = cipher.encrypt(Nonce::from_slice(&nonce), plaintext).ok()?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Some(out)
}

/// Déchiffre un blob nonce(12o) ++ ciphertext produit par `encrypt`.
pub(crate) fn decrypt(key: &[u8; 32], blob: &[u8]) -> Option<Vec<u8>> {
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

/// Types MIME acceptés à l'upload : liste blanche EXPLICITE plutôt qu'un simple
/// préfixe `image/`/`video/` (SECURITY_FINDINGS.md #7). Le Content-Type déclaré
/// est stocké tel quel et renvoyé sans modification à la lecture (SEC-008) — un
/// préfixe seul laissait passer `image/svg+xml` : un SVG est un document XML
/// pouvant embarquer un `<script>`, exécuté si jamais servi/ouvert comme document
/// plutôt qu'affiché en `<img>` (ex. « ouvrir l'image dans un nouvel onglet » côté
/// navigateur, un raccourci que certains navigateurs offrent même quand le clic
/// droit est neutralisé côté JS). La liste blanche ne couvre que des formats
/// matriciels sans contenu actif ; le frontend n'envoie déjà que
/// `accept="image/*,video/*"` mais ce n'est qu'un filtre de confort côté client,
/// pas une garantie — cette fonction est la seule vraie barrière.
const ALLOWED_MIMES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/avif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-m4v",
    "video/3gpp",
    "video/ogg",
];

fn mime_allowed(mime: &str) -> bool {
    ALLOWED_MIMES.contains(&mime)
}

/// Correspondance MIME → type reconnu par `little_exif`, pour les seuls formats
/// où retirer les métadonnées a du sens (photos). `None` pour les vidéos et les
/// formats non couverts par la lib — l'appelant garde alors les octets bruts.
///
/// PNG est DÉLIBÉRÉMENT ABSENT malgré le support de `little_exif` : son chemin
/// PNG passe par `quick-xml` 0.37.5 pour le XMP (`clear_metadata` →
/// `xmp::remove_exif_from_xmp`), une version affectée par deux advisories haute
/// sévérité (RUSTSEC-2026-0194/0195, déni de service — allocation/complexité
/// non bornées sur une entrée XML forgée). `little_exif` épingle `quick-xml =
/// "0.37.5"` dans son propre `Cargo.toml` : impossible de corriger par un
/// simple `cargo update` tant que la lib amont ne bouge pas. Plutôt
/// qu'introduire une nouvelle surface de déni de service pour fermer une fuite
/// de vie privée, on exclut PNG du nettoyage (retour au comportement
/// inchangé pour ce format — ni pire ni meilleur qu'avant #14) ; JPEG, WebP et
/// HEIF/HEIC ne passent par aucun code lié à `quick-xml` dans cette lib (vérifié
/// dans ses sources) et restent couverts. PNG est rarement porteur d'EXIF/GPS
/// en pratique (ce n'est pas un format de sortie d'appareil photo) — impact
/// pratique minime. À revoir si `little_exif`/`quick-xml` publient un correctif.
fn exif_file_type(mime: &str) -> Option<FileExtension> {
    match mime {
        "image/jpeg" => Some(FileExtension::JPEG),
        "image/webp" => Some(FileExtension::WEBP),
        "image/heic" | "image/heif" => Some(FileExtension::HEIF),
        _ => None,
    }
}

/// Retire les métadonnées EXIF (GPS, modèle d'appareil, date de prise de vue…)
/// d'une photo à l'upload (SECURITY_FINDINGS.md #14) : les photos de téléphone
/// embarquent typiquement les coordonnées GPS du lieu de la prise (souvent le
/// domicile), qui survivraient sinon telles quelles jusqu'au téléchargement par
/// le/la partenaire (confirmé par PoC : upload puis re-téléchargement d'un JPEG
/// avec un marqueur EXIF/GPS factice → octets identiques, marqueur intact).
///
/// L'orientation est délibérément PRÉSERVÉE : les navigateurs appliquent la
/// rotation depuis le tag EXIF `Orientation` (`image-orientation: from-image`,
/// comportement par défaut depuis des années) — tout effacer sans distinction
/// ferait apparaître de travers une photo prise en portrait. On lit donc ce tag
/// avant d'effacer, puis on le réinsère seul (aucune autre donnée) si présent.
///
/// Best-effort et non bloquant : `None` (octets originaux conservés par
/// l'appelant, cf. `upload`) si le format n'est pas couvert (vidéos ; formats
/// non supportés par `little_exif`) ou si la lecture/écriture échoue pour une
/// raison quelconque (fichier légèrement non conforme…) — on ne fait jamais
/// échouer un upload légitime à cause d'un nettoyage de métadonnées.
fn strip_metadata(bytes: &[u8], mime: &str) -> Option<Vec<u8>> {
    let file_type = exif_file_type(mime)?;
    let mut buffer = bytes.to_vec();

    let orientation = read_orientation(&buffer, file_type);

    ExifMetadata::clear_metadata(&mut buffer, file_type).ok()?;

    if let Some(orientation_tag) = orientation {
        let mut minimal = ExifMetadata::new();
        minimal.set_tag(orientation_tag);
        minimal.write_to_vec(&mut buffer, file_type).ok()?;
    }

    Some(buffer)
}

/// Lit le tag EXIF `Orientation`, si présent (best-effort : `None` aussi bien en
/// son absence qu'en cas d'échec de lecture). Partagé par `strip_metadata` (le
/// préserver) et `image_dimensions` (corriger le sens largeur/hauteur ci-dessous).
fn read_orientation(bytes: &[u8], file_type: FileExtension) -> Option<ExifTag> {
    ExifMetadata::new_from_vec(&bytes.to_vec(), file_type)
        .ok()
        .and_then(|m| m.get_tag(&ExifTag::Orientation(Vec::new())).next().cloned())
}

/// Dimensions (largeur, hauteur) d'une image à l'upload, calculées une seule fois
/// pour éviter au frontend d'attendre le premier chargement du fichier avant de
/// poser le bon cadre (médias authentifiés chargés paresseusement, cf. SafeMedia
/// côté frontend). Le format est deviné depuis les octets (magic bytes), pas
/// depuis le Content-Type déclaré. Lecture d'EN-TÊTE seule pour les formats
/// couverts (pas de décodage pixel complet) ; best-effort et jamais bloquant :
/// `None` pour une vidéo, un HEIC/HEIF (non supporté par ce crate) ou tout échec
/// de lecture — la carte retombe alors sur un ratio par défaut côté frontend.
///
/// L'EXIF `Orientation` 5/6/7/8 (rotation 90°/270°) inverse largeur et hauteur :
/// ces valeurs, telles que codées dans l'en-tête du fichier, ne correspondent
/// PAS à ce que `naturalWidth`/`naturalHeight` renverront dans le navigateur
/// (qui applique cette rotation à l'affichage) — sans ce correctif, une photo
/// portrait d'iPhone recevrait un placeholder au ratio paysage, exactement le
/// bug qu'on cherche à éviter.
fn image_dimensions(bytes: &[u8], mime: &str) -> Option<(i32, i32)> {
    let (w, h) = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()?;
    let (mut w, mut h) = (w as i32, h as i32);

    if let Some(file_type) = exif_file_type(mime) {
        if let Some(ExifTag::Orientation(values)) = read_orientation(bytes, file_type) {
            if matches!(values.first(), Some(5..=8)) {
                std::mem::swap(&mut w, &mut h);
            }
        }
    }
    Some((w, h))
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
           AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
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
    ip: ClientIp,
    Path(space_id): Path<Uuid>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<MediaCreated>)> {
    if state
        .rate_limiter
        .is_limited(&format!("upload:ip:{}", ip.0), UPLOAD_MAX_ATTEMPTS, UPLOAD_WINDOW)
        || state.rate_limiter.is_limited(
            &format!("upload:user:{}", auth.user_id),
            UPLOAD_MAX_ATTEMPTS,
            UPLOAD_WINDOW,
        )
    {
        return Err(ApiError::TooManyRequests(
            "trop d'uploads, réessaie dans une minute".into(),
        ));
    }
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    // On garde le `Bytes` tel quel (déjà possédé, partage Arc) plutôt qu'un
    // `to_vec()` qui recopierait jusqu'à 100 Mo pour rien (RUST-06).
    let mut data: Option<(Bytes, String)> = None;
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
                data = Some((bytes, mime));
            }
            Some("viewOnce") => {
                let v = field.text().await.unwrap_or_default();
                view_once = v == "true" || v == "1";
            }
            _ => {}
        }
    }

    let (bytes, mime) = data.ok_or(ApiError::BadRequest("champ 'file' manquant".into()))?;
    if !mime_allowed(&mime) {
        return Err(ApiError::BadRequest(format!(
            "type de média non autorisé : {mime}"
        )));
    }

    // Retire les métadonnées EXIF (GPS…) avant tout le reste, y compris le
    // chiffrement (SECURITY_FINDINGS.md #14). CPU-bound (parsing/réécriture de
    // segments) → spawn_blocking (RUST-02). Best-effort : en cas d'échec ou de
    // format non couvert (vidéos…), on garde les octets originaux tels quels
    // plutôt que d'échouer l'upload.
    let bytes = {
        let mime_for_strip = mime.clone();
        let original = bytes.clone(); // `Bytes::clone` = partage Arc, pas de copie (RUST-06)
        match tokio::task::spawn_blocking(move || strip_metadata(&original, &mime_for_strip))
            .await
        {
            Ok(Some(stripped)) => Bytes::from(stripped),
            _ => bytes,
        }
    };

    // Dimensions best-effort (cf. `image_dimensions`) : calculées sur les octets EN
    // CLAIR, avant un éventuel chiffrement ci-dessous qui les rendrait illisibles
    // comme image. Lecture d'en-tête, négligeable en coût → pas de spawn_blocking.
    let (width, height) = image_dimensions(&bytes, &mime).unzip();

    // Chiffrement au repos si une clé est configurée (sinon stockage en clair).
    // AES-GCM sur un fichier (jusqu'à 100 Mo) est CPU-bound → `spawn_blocking`
    // pour ne pas bloquer un thread du runtime async (RUST-02).
    let (to_write, encrypted) = match state.config.media_key_bytes() {
        Some(key) => {
            let ct = tokio::task::spawn_blocking(move || encrypt(&key, &bytes))
                .await
                .map_err(|_| ApiError::Internal)?
                .ok_or(ApiError::Internal)?;
            (Bytes::from(ct), true)
        }
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
        "INSERT INTO media (space_id, owner_id, storage_key, mime, view_once, encrypted, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&storage_key)
    .bind(&mime)
    .bind(view_once)
    .bind(encrypted)
    .bind(width)
    .bind(height)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(MediaCreated { id, mime, view_once })))
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

    // NB (RR-01) : `posts.allow_download` (#78) n'est PAS appliqué ici, et c'est
    // volontaire — c'est un *hint de présentation* (cacher le bouton ⤓ côté
    // client), pas une barrière d'accès. Cette route sert AUSSI l'affichage
    // flouté (press-and-hold) : la cloisonner sur `allow_download` casserait la
    // simple visualisation. Et tout média qu'on peut afficher reste « enregistrable »
    // (capture d'écran a minima) → la prévention de download est par nature douce,
    // comme le flou. La vraie barrière reste l'auth (`ensure_member`) + `view_once`.

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
        // view_once : on RÉCLAME le média de façon atomique AVANT de le lire. En cas
        // de requêtes concurrentes, une seule gagne l'UPDATE (transition
        // false→true) ; l'autre obtient 0 ligne → NotFound. Sans ça, les deux
        // passeraient le check `consumed` puis liraient le fichier (race), et le
        // média éphémère serait servi plusieurs fois (SEC-004).
        if media.view_once {
            let claimed: Option<Uuid> = sqlx::query_scalar(
                "UPDATE media SET consumed = true
                 WHERE id = $1 AND consumed = false AND view_once = true
                 RETURNING id",
            )
            .bind(media.id)
            .fetch_optional(&state.pool)
            .await?;
            if claimed.is_none() {
                tracing::debug!(%media_id, "média éphémère déjà réclamé (course)");
                return Err(ApiError::NotFound);
            }
        }

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
            // Déchiffrement AES-GCM CPU-bound → hors du runtime async (RUST-02).
            tokio::task::spawn_blocking(move || decrypt(&key, &raw))
                .await
                .map_err(|_| ApiError::Internal)?
                .ok_or_else(|| {
                    tracing::error!(%media_id,
                        "déchiffrement AES échoué (MEDIA_KEY a-t-elle changé ?)");
                    ApiError::Internal
                })?
        } else {
            raw
        };

        if media.view_once {
            // Déjà marqué consommé (claim atomique ci-dessus) : on supprime juste
            // le fichier sur disque.
            let _ = tokio::fs::remove_file(&path).await;
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

/// Sous-commande de maintenance : chiffre au repos les médias encore EN CLAIR
/// (`encrypted = false`). Sûr et **ré-exécutable** : chaque média est écrit dans
/// un NOUVEAU fichier (nouveau storage_key), la ligne est basculée de façon
/// atomique (`UPDATE … WHERE encrypted = false`), puis l'ancien fichier en clair
/// est supprimé. Un crash en cours ne laisse au pire qu'un fichier orphelin
/// inoffensif (jamais de double-chiffrement ni de corruption). Idempotent.
pub async fn backfill_encryption(
    pool: &sqlx::PgPool,
    media_dir: &str,
    key: &[u8; 32],
) -> Result<(), Box<dyn std::error::Error>> {
    let rows: Vec<(Uuid, String)> =
        sqlx::query_as("SELECT id, storage_key FROM media WHERE encrypted = false")
            .fetch_all(pool)
            .await?;
    if rows.is_empty() {
        tracing::info!("backfill chiffrement : aucun média en clair, rien à faire.");
        return Ok(());
    }
    tracing::info!(count = rows.len(), "backfill chiffrement : médias en clair à traiter");

    let mut done = 0usize;
    for (id, old_key) in rows {
        let old_path = media_path(media_dir, &old_key);
        let plaintext = match tokio::fs::read(&old_path).await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(%id, key = %old_key, error = ?e, "fichier absent, ignoré");
                continue;
            }
        };
        let cipher = encrypt(key, &plaintext).ok_or("échec du chiffrement")?;

        // Écrit le ciphertext dans un nouveau fichier (nouveau storage_key).
        let new_key = Uuid::new_v4().to_string();
        let new_path = media_path(media_dir, &new_key);
        tokio::fs::write(&new_path, &cipher).await?;

        // Bascule atomique de la ligne. Si 0 ligne (déjà fait en concurrence), on
        // nettoie le fichier qu'on vient d'écrire.
        let updated = sqlx::query(
            "UPDATE media SET storage_key = $2, encrypted = true
             WHERE id = $1 AND encrypted = false",
        )
        .bind(id)
        .bind(&new_key)
        .execute(pool)
        .await?;
        if updated.rows_affected() == 0 {
            let _ = tokio::fs::remove_file(&new_path).await;
            continue;
        }

        // L'ancien fichier en clair n'est plus référencé : on le supprime.
        if let Err(e) = tokio::fs::remove_file(&old_path).await {
            tracing::warn!(%id, key = %old_key, error = ?e,
                "ancien fichier en clair non supprimé (à nettoyer manuellement)");
        }
        done += 1;
    }
    tracing::info!(done, "backfill chiffrement terminé.");
    Ok(())
}

/// Sous-commande de maintenance : **rotation de clé** — migre tous les médias de
/// `old_key` vers `new_key` (déchiffre avec l'ancienne, rechiffre avec la nouvelle ;
/// un média en clair, `encrypted = false`, est simplement chiffré avec la nouvelle).
/// Même garanties que `backfill_encryption` (nouveau storage_key, bascule atomique
/// `… WHERE storage_key = <ancien>`, suppression de l'ancien fichier). **Ré-exécutable** :
/// un média déjà migré (qui ne déchiffre qu'avec la nouvelle clé — l'auth GCM rejette
/// l'ancienne) est détecté et ignoré ; un crash ne laisse au pire qu'un orphelin.
pub async fn rotate_key(
    pool: &sqlx::PgPool,
    media_dir: &str,
    old_key: &[u8; 32],
    new_key: &[u8; 32],
) -> Result<(), Box<dyn std::error::Error>> {
    let rows: Vec<(Uuid, String, bool)> =
        sqlx::query_as("SELECT id, storage_key, encrypted FROM media")
            .fetch_all(pool)
            .await?;
    if rows.is_empty() {
        tracing::info!("rotation de clé média : aucun média.");
        return Ok(());
    }
    tracing::info!(count = rows.len(), "rotation de clé média : médias à traiter");

    let mut rotated = 0usize;
    let mut skipped = 0usize;
    for (id, old_storage, encrypted) in rows {
        let old_path = media_path(media_dir, &old_storage);
        let raw = match tokio::fs::read(&old_path).await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(%id, key = %old_storage, error = ?e, "fichier absent, ignoré");
                continue;
            }
        };
        let plaintext: Vec<u8> = if encrypted {
            if let Some(pt) = decrypt(old_key, &raw) {
                pt
            } else if decrypt(new_key, &raw).is_some() {
                // Déjà chiffré avec la nouvelle clé (rotation déjà passée) → on saute.
                skipped += 1;
                continue;
            } else {
                return Err(format!(
                    "média {id} : ne déchiffre ni avec l'ancienne ni la nouvelle clé (clé erronée ?)"
                )
                .into());
            }
        } else {
            raw
        };

        let cipher = encrypt(new_key, &plaintext).ok_or("échec du chiffrement")?;
        let new_storage = Uuid::new_v4().to_string();
        let new_path = media_path(media_dir, &new_storage);
        tokio::fs::write(&new_path, &cipher).await?;

        let updated = sqlx::query(
            "UPDATE media SET storage_key = $2, encrypted = true
             WHERE id = $1 AND storage_key = $3",
        )
        .bind(id)
        .bind(&new_storage)
        .bind(&old_storage)
        .execute(pool)
        .await?;
        if updated.rows_affected() == 0 {
            let _ = tokio::fs::remove_file(&new_path).await;
            continue;
        }
        if let Err(e) = tokio::fs::remove_file(&old_path).await {
            tracing::warn!(%id, key = %old_storage, error = ?e,
                "ancien fichier non supprimé (à nettoyer manuellement)");
        }
        rotated += 1;
    }
    tracing::info!(rotated, skipped, "rotation de clé média terminée.");
    Ok(())
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
    fn mime_liste_blanche() {
        assert!(mime_allowed("image/jpeg"));
        assert!(mime_allowed("image/png"));
        assert!(mime_allowed("image/webp"));
        assert!(mime_allowed("video/mp4"));
        assert!(mime_allowed("video/quicktime"));
        assert!(!mime_allowed("text/html"));
        assert!(!mime_allowed("application/javascript"));
        assert!(!mime_allowed("application/octet-stream"));
        assert!(!mime_allowed(""));
        assert!(!mime_allowed("imagexml")); // pas de "/" → pas dans la liste
    }

    /// SECURITY_FINDINGS.md #7 : un SVG est un document XML pouvant embarquer un
    /// `<script>` — jamais accepté, même si son préfixe est `image/`.
    #[test]
    fn mime_svg_toujours_refuse() {
        assert!(!mime_allowed("image/svg+xml"));
        assert!(!mime_allowed("image/svg"));
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
    fn nonce_aleatoire_jamais_nul_ni_reutilise() {
        // Un nonce AES-GCM répété avec la même clé est catastrophique : deux
        // chiffrements du même clair doivent avoir des nonces (12 premiers
        // octets) différents, et un nonce jamais entièrement nul.
        let key = [7u8; 32];
        let nonces: Vec<Vec<u8>> = (0..64)
            .map(|_| encrypt(&key, b"meme clair").unwrap()[..12].to_vec())
            .collect();
        for n in &nonces {
            assert_ne!(n, &vec![0u8; 12]);
        }
        let uniques: std::collections::HashSet<_> = nonces.iter().collect();
        assert_eq!(uniques.len(), nonces.len());
    }

    #[test]
    fn dechiffrement_echoue_si_mauvaise_cle_ou_blob_court() {
        let key = [7u8; 32];
        let blob = encrypt(&key, b"secret").unwrap();
        assert!(decrypt(&[9u8; 32], &blob).is_none()); // GCM rejette
        assert!(decrypt(&key, b"court").is_none()); // < 12 octets de nonce
    }

    /// Construit un JPEG minimal (via le crate `image`, dev-dependency
    /// uniquement — jamais dans le binaire de prod) puis y embarque un GPS et
    /// une orientation via `little_exif`, pour servir de fixture réaliste aux
    /// tests SECURITY_FINDINGS.md #14 ci-dessous.
    fn fixture_jpeg_avec_gps_et_orientation(orientation: u16) -> Vec<u8> {
        use little_exif::rational::uR64;

        let img = image::RgbImage::from_pixel(4, 4, image::Rgb([200, 50, 80]));
        let mut jpeg_bytes: Vec<u8> = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut jpeg_bytes), image::ImageFormat::Jpeg)
            .expect("encodage JPEG de test");

        let mut metadata = ExifMetadata::new();
        metadata.set_tag(ExifTag::GPSLatitude(vec![
            uR64 { nominator: 48, denominator: 1 },
            uR64 { nominator: 51, denominator: 1 },
            uR64 { nominator: 0, denominator: 1 },
        ]));
        metadata.set_tag(ExifTag::Orientation(vec![orientation]));
        metadata
            .write_to_vec(&mut jpeg_bytes, FileExtension::JPEG)
            .expect("écriture EXIF de test");

        // Vérifie que la fixture porte bien ce qu'on croit y avoir mis, sinon
        // le test principal ne prouverait rien.
        let check = ExifMetadata::new_from_vec(&jpeg_bytes, FileExtension::JPEG).unwrap();
        assert!(check.get_tag(&ExifTag::GPSLatitude(vec![])).next().is_some());
        jpeg_bytes
    }

    #[test]
    fn strip_metadata_retire_le_gps_et_garde_l_orientation() {
        let original = fixture_jpeg_avec_gps_et_orientation(6); // 6 = rotation 90°
        let stripped = strip_metadata(&original, "image/jpeg").expect("stripping JPEG supporté");

        assert_ne!(stripped, original, "les octets doivent changer (métadonnées retirées)");

        let after = ExifMetadata::new_from_vec(&stripped, FileExtension::JPEG).unwrap();
        assert!(
            after.get_tag(&ExifTag::GPSLatitude(vec![])).next().is_none(),
            "le GPS ne doit plus être présent"
        );
        let orientation_after = after
            .get_tag(&ExifTag::Orientation(vec![]))
            .next()
            .expect("l'orientation doit être préservée");
        assert_eq!(orientation_after, &ExifTag::Orientation(vec![6]));

        // L'image reste décodable et de mêmes dimensions (pixels intacts).
        let decoded = image::load_from_memory_with_format(&stripped, image::ImageFormat::Jpeg)
            .expect("l'image nettoyée doit rester décodable");
        assert_eq!((decoded.width(), decoded.height()), (4, 4));
    }

    #[test]
    fn strip_metadata_sans_orientation_prealable_nen_ajoute_pas() {
        // Une image sans tag Orientation au départ ne doit pas se retrouver
        // avec une orientation par défaut ajoutée artificiellement.
        let img = image::RgbImage::from_pixel(2, 2, image::Rgb([0, 0, 0]));
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
            .unwrap();

        let stripped = strip_metadata(&bytes, "image/jpeg").expect("stripping JPEG supporté");
        // Pas d'EXIF du tout au départ (fixture générée sans little_exif) : la
        // lecture peut légitimement échouer ("No EXIF data found!") plutôt que
        // renvoyer un `Metadata` vide — dans les deux cas, aucune orientation.
        let has_orientation = ExifMetadata::new_from_vec(&stripped, FileExtension::JPEG)
            .ok()
            .is_some_and(|m| m.get_tag(&ExifTag::Orientation(vec![])).next().is_some());
        assert!(!has_orientation);
    }

    /// Fixture JPEG rectangulaire (largeur ≠ hauteur) : une image carrée ne
    /// révélerait pas un bug d'inversion largeur/hauteur.
    fn fixture_jpeg_rectangulaire(orientation: Option<u16>) -> Vec<u8> {
        let img = image::RgbImage::from_pixel(6, 3, image::Rgb([10, 20, 30]));
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
            .expect("encodage JPEG de test");
        if let Some(o) = orientation {
            let mut metadata = ExifMetadata::new();
            metadata.set_tag(ExifTag::Orientation(vec![o]));
            metadata
                .write_to_vec(&mut bytes, FileExtension::JPEG)
                .expect("écriture EXIF de test");
        }
        bytes
    }

    #[test]
    fn image_dimensions_sans_orientation() {
        let bytes = fixture_jpeg_rectangulaire(None);
        assert_eq!(image_dimensions(&bytes, "image/jpeg"), Some((6, 3)));
    }

    #[test]
    fn image_dimensions_normale_non_inversee() {
        // Orientation 1 = normale : pas de rotation, pas d'inversion.
        let bytes = fixture_jpeg_rectangulaire(Some(1));
        assert_eq!(image_dimensions(&bytes, "image/jpeg"), Some((6, 3)));
    }

    #[test]
    fn image_dimensions_inversees_si_rotation_90_ou_270() {
        // 6 = rotation 90° CW, 8 = rotation 90° CCW : toutes deux inversent
        // largeur/hauteur pour correspondre à naturalWidth/naturalHeight côté
        // navigateur (qui applique la rotation EXIF à l'affichage) — sinon une
        // photo portrait d'iPhone recevrait un placeholder au ratio paysage.
        for orientation in [6, 8] {
            let bytes = fixture_jpeg_rectangulaire(Some(orientation));
            assert_eq!(
                image_dimensions(&bytes, "image/jpeg"),
                Some((3, 6)),
                "orientation {orientation}"
            );
        }
    }

    #[test]
    fn image_dimensions_video_ou_format_illisible_renvoie_none() {
        assert_eq!(image_dimensions(b"pas une image", "video/mp4"), None);
        assert_eq!(image_dimensions(b"pas une image non plus", "image/heic"), None);
    }

    #[test]
    fn strip_metadata_format_non_couvert_renvoie_none() {
        // Vidéo (ou tout type hors de exif_file_type) : pas de traitement, la
        // fonction appelante garde les octets originaux (cf. `upload`).
        assert!(strip_metadata(b"peu importe le contenu", "video/mp4").is_none());
    }

    /// PNG exclu volontairement (quick-xml 0.37.5 vulnérable via le chemin XMP
    /// de little_exif, cf. le commentaire d'`exif_file_type`) — ne doit PAS
    /// redevenir couvert par erreur lors d'une future modification.
    #[test]
    fn strip_metadata_png_exclu_volontairement() {
        assert!(exif_file_type("image/png").is_none());
        assert!(strip_metadata(b"peu importe le contenu", "image/png").is_none());
    }
}
