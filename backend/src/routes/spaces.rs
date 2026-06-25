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

// Un salon accueille jusqu'à 8 membres (#52 multi-partenaires) : le couple reste
// le cas par défaut, mais le polyamour / les petits groupes sont permis. Plafond
// de sûreté (pas illimité) — le modèle de données est multi-ready depuis V1.
const MAX_MEMBERS: i64 = 8;

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
    /// Défaut du salon « média téléchargeable » des nouveaux posts (#78).
    pub allow_media_download: Option<bool>,
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
         RETURNING id, name, timezone, reactions, allow_custom_reactions, blind_mood, allow_media_download, created_at",
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

    // Activation du téléchargement des médias (#84) : on note la transition
    // false→true pour émettre une notice « X a activé le téléchargement ».
    let mut download_enabled = false;
    if body.allow_media_download == Some(true) {
        let prev: bool =
            sqlx::query_scalar("SELECT allow_media_download FROM spaces WHERE id = $1")
                .bind(space_id)
                .fetch_one(&state.pool)
                .await?;
        download_enabled = !prev;
    }

    let space: Space = sqlx::query_as(
        "UPDATE spaces SET
            name = COALESCE($2, name),
            timezone = COALESCE($3, timezone),
            reactions = COALESCE($4, reactions),
            allow_custom_reactions = COALESCE($5, allow_custom_reactions),
            blind_mood = COALESCE($6, blind_mood),
            allow_media_download = COALESCE($7, allow_media_download)
         WHERE id = $1
         RETURNING id, name, timezone, reactions, allow_custom_reactions, blind_mood, allow_media_download, created_at",
    )
    .bind(space_id)
    .bind(name)
    .bind(&body.timezone)
    .bind(body.reactions.as_deref())
    .bind(body.allow_custom_reactions)
    .bind(body.blind_mood)
    .bind(body.allow_media_download)
    .fetch_one(&state.pool)
    .await?;

    if download_enabled {
        crate::routes::notices::record(
            &state.pool,
            space_id,
            "download_enabled",
            auth.user_id,
        )
        .await;
    }

    state.emit(space_id, auth.user_id, EventKind::Space);
    Ok(Json(space))
}

async fn my_spaces(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<Space>>> {
    let spaces: Vec<Space> = sqlx::query_as(
        "SELECT s.id, s.name, s.timezone, s.reactions, s.allow_custom_reactions, s.blind_mood, s.allow_media_download, s.created_at
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
    /// Code lisible à partager (#89), ex. `EmberVelvet#7`.
    pub code: String,
}

/// Plafond d'invitations actives (non utilisées, non expirées) par salon —
/// borne l'accumulation de tokens (SEC-NEW-004). Large devant les 8 membres max.
const MAX_ACTIVE_INVITES: i64 = 10;

/// Génère une invitation à usage unique (valable 7 jours) pour ce salon.
async fn create_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<InviteCreated>)> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    // Anti-accumulation : on borne les invitations actives par salon (SEC-NEW-004).
    let active: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM space_invites
         WHERE space_id = $1 AND used_at IS NULL AND expires_at > now()",
    )
    .bind(space_id)
    .fetch_one(&state.pool)
    .await?;
    if active >= MAX_ACTIVE_INVITES {
        return Err(ApiError::Conflict(
            "trop d'invitations actives pour ce salon".into(),
        ));
    }
    // Génère un code lisible (#89) ; en cas de collision (index unique sur
    // lower(code)), on régénère (rare : ≤ 10 invitations actives par salon).
    let mut last_err = None;
    for _ in 0..8 {
        let code = crate::invite_code::generate();
        let inserted = sqlx::query(
            "INSERT INTO space_invites (space_id, created_by, expires_at, code)
             VALUES ($1, $2, now() + interval '7 days', $3)",
        )
        .bind(space_id)
        .bind(auth.user_id)
        .bind(&code)
        .execute(&state.pool)
        .await;
        match inserted {
            Ok(_) => return Ok((StatusCode::CREATED, Json(InviteCreated { code }))),
            Err(e) if is_unique_violation(&e) => {
                last_err = Some(e);
                continue;
            }
            Err(e) => return Err(e.into()),
        }
    }
    Err(last_err.map(ApiError::from).unwrap_or(ApiError::Internal))
}

/// Vrai si l'erreur SQL est une violation de contrainte d'unicité (code 23505).
fn is_unique_violation(e: &sqlx::Error) -> bool {
    matches!(e, sqlx::Error::Database(db) if db.code().as_deref() == Some("23505"))
}

#[derive(Deserialize)]
pub struct JoinBody {
    /// Code d'invitation lisible (#89), insensible à la casse.
    pub code: String,
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

    // Lookup insensible à la casse (#89) ; invitation verrouillée le temps de la
    // transaction. On récupère aussi le token (PK) pour la consommer.
    let code = crate::invite_code::normalize(&body.code);
    let invite: Option<(Uuid, Uuid, Option<chrono::DateTime<chrono::Utc>>, bool)> =
        sqlx::query_as(
            "SELECT token, space_id, used_at, (expires_at < now()) AS expired
             FROM space_invites WHERE lower(code) = $1 FOR UPDATE",
        )
        .bind(&code)
        .fetch_optional(&mut *tx)
        .await?;
    let (token, space_id, used_at, expired) =
        invite.ok_or(ApiError::BadRequest("invitation invalide".into()))?;
    if used_at.is_some() {
        return Err(ApiError::Conflict("invitation déjà utilisée".into()));
    }
    if expired {
        return Err(ApiError::Conflict("invitation expirée".into()));
    }

    let space: Space = sqlx::query_as(
        "SELECT id, name, timezone, reactions, allow_custom_reactions, blind_mood, allow_media_download, created_at
         FROM spaces WHERE id = $1 FOR UPDATE",
    )
    .bind(space_id)
    .fetch_one(&mut *tx)
    .await?;

    // Déjà membre : on renvoie le salon sans consommer l'invitation (ré-jointure
    // idempotente). Conséquence (SEC-NEW-003, comportement assumé) : un token
    // n'est consommé que par un NOUVEAU membre ; un membre déjà présent peut le
    // ré-utiliser sans le dépenser — sans gain de privilège (il a déjà accès).
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
        .bind(token)
        .execute(&mut *tx)
        .await?;
    // Notice « X a rejoint le salon » pour les autres membres (#85).
    crate::routes::notices::record(&mut *tx, space_id, "member_joined", auth.user_id).await;
    tx.commit().await?;

    // Prévient les membres en ligne (refetch notices/membres) + push best-effort.
    state.emit(space_id, auth.user_id, EventKind::Space);
    crate::notifications::notify_members(
        &state,
        space_id,
        auth.user_id,
        "Un membre a rejoint le salon".into(),
    );

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

/// Purge périodique des invitations devenues inutiles (consommées ou expirées) —
/// borne la table `space_invites` (SEC-NEW-004). Best-effort (erreur journalisée).
pub async fn purge_stale_invites(pool: &sqlx::PgPool) {
    match sqlx::query(
        "DELETE FROM space_invites WHERE used_at IS NOT NULL OR expires_at < now()",
    )
    .execute(pool)
    .await
    {
        Ok(res) if res.rows_affected() > 0 => {
            tracing::info!(count = res.rows_affected(), "invitations périmées purgées");
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = ?e, "purge des invitations échouée"),
    }
}
