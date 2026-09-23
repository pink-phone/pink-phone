use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::NotificationEntry;
use crate::routes::ensure_member;
use crate::state::AppState;

const NOTIF_MODES: [&str; 3] = ["push", "digest", "ghost"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/me/settings", get(get_settings).put(set_settings))
        .route("/api/notifications/vapid", get(vapid))
        .route("/api/me/push", post(subscribe).delete(unsubscribe))
        .route("/api/spaces/{id}/notifications", get(list_notifications))
        .route(
            "/api/spaces/{id}/notifications/unread-count",
            get(unread_count),
        )
        .route(
            "/api/spaces/{id}/notifications/read-all",
            put(mark_all_read),
        )
        .route(
            "/api/spaces/{id}/notifications/{notification_id}/read",
            put(mark_read),
        )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub notif_mode: String,
}

async fn get_settings(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Settings>> {
    let mode: Option<String> =
        sqlx::query_scalar("SELECT notif_mode FROM user_settings WHERE user_id = $1")
            .bind(auth.user_id)
            .fetch_optional(&state.pool)
            .await?;
    Ok(Json(Settings {
        // Sans choix explicite de l'utilisateur, le défaut est "ghost" (discret) :
        // pas de push tant qu'on ne l'a pas activé.
        notif_mode: mode.unwrap_or_else(|| "ghost".into()),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingsBody {
    pub notif_mode: String,
}

async fn set_settings(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SetSettingsBody>,
) -> ApiResult<Json<Settings>> {
    if !NOTIF_MODES.contains(&body.notif_mode.as_str()) {
        return Err(ApiError::BadRequest("mode de notification inconnu".into()));
    }
    sqlx::query(
        "INSERT INTO user_settings (user_id, notif_mode, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id)
         DO UPDATE SET notif_mode = EXCLUDED.notif_mode, updated_at = now()",
    )
    .bind(auth.user_id)
    .bind(&body.notif_mode)
    .execute(&state.pool)
    .await?;
    Ok(Json(Settings {
        notif_mode: body.notif_mode,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VapidKey {
    pub public_key: String,
}

/// Clé publique VAPID à utiliser comme applicationServerKey côté navigateur.
/// Vide si le push n'est pas configuré sur le serveur.
async fn vapid(State(state): State<AppState>) -> Json<VapidKey> {
    Json(VapidKey {
        public_key: state.config.vapid_public_key.clone(),
    })
}

#[derive(Deserialize)]
pub struct SubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Deserialize)]
pub struct SubscribeBody {
    pub endpoint: String,
    pub keys: SubscriptionKeys,
}

async fn subscribe(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SubscribeBody>,
) -> ApiResult<StatusCode> {
    // SECURITY_FINDINGS.md #11 (SSRF) : `endpoint` finit comme cible d'une
    // requête HTTP sortante (notify_members) — rejeté ici si ce n'est pas un
    // vrai service de push public (échec rapide ; revalidé aussi à l'envoi).
    if !crate::notifications::endpoint_is_safe(&body.endpoint).await {
        return Err(ApiError::BadRequest("endpoint de notification invalide".into()));
    }
    sqlx::query(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint)
         DO UPDATE SET user_id = EXCLUDED.user_id,
                       p256dh = EXCLUDED.p256dh,
                       auth = EXCLUDED.auth",
    )
    .bind(auth.user_id)
    .bind(&body.endpoint)
    .bind(&body.keys.p256dh)
    .bind(&body.keys.auth)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct UnsubscribeQuery {
    pub endpoint: String,
}

/// Désabonnement : l'endpoint passe en query (API-06, plus de corps sur un DELETE).
async fn unsubscribe(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<UnsubscribeQuery>,
) -> ApiResult<StatusCode> {
    sqlx::query(
        "DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
    )
    .bind(&q.endpoint)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Centre de notifications ----------

/// Les 50 notifications les plus récentes de l'utilisateur courant dans ce
/// salon (même plafond que `notices::list_notices`).
async fn list_notifications(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<NotificationEntry>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let rows: Vec<NotificationEntry> = sqlx::query_as(
        "SELECT n.id, n.kind, n.actor_id, u.display_name AS actor_name, n.entity_id, n.comment_id,
                (n.read_at IS NOT NULL) AS read, n.created_at
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.space_id = $1 AND n.user_id = $2
         ORDER BY n.created_at DESC
         LIMIT 50",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreadCount {
    pub count: i64,
}

async fn unread_count(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<UnreadCount>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM notifications
         WHERE space_id = $1 AND user_id = $2 AND read_at IS NULL",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(UnreadCount { count }))
}

/// Marque UNE notification comme lue (uniquement la mienne — l'appartenance au
/// salon ne suffit pas, `user_id` doit correspondre : #62 même logique que les
/// autres mutations "propriétaire").
async fn mark_read(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, notification_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    let res = sqlx::query(
        "UPDATE notifications SET read_at = now()
         WHERE id = $1 AND space_id = $2 AND user_id = $3 AND read_at IS NULL",
    )
    .bind(notification_id)
    .bind(space_id)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        // Idempotent si déjà lue ; introuvable seulement si l'id/salon/proprio ne
        // correspond à rien — les deux cas sont indistinguables sans requête
        // supplémentaire, donc on ne fait pas échouer un double-clic "déjà lu".
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM notifications WHERE id = $1 AND space_id = $2 AND user_id = $3)",
        )
        .bind(notification_id)
        .bind(space_id)
        .bind(auth.user_id)
        .fetch_one(&state.pool)
        .await?;
        if !exists {
            return Err(ApiError::NotFound);
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Marque toutes mes notifications non lues du salon comme lues.
async fn mark_all_read(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    sqlx::query(
        "UPDATE notifications SET read_at = now()
         WHERE space_id = $1 AND user_id = $2 AND read_at IS NULL",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
