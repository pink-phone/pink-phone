use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

const NOTIF_MODES: [&str; 3] = ["push", "digest", "ghost"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/me/settings", get(get_settings).put(set_settings))
        .route("/api/notifications/vapid", get(vapid))
        .route("/api/me/push", post(subscribe).delete(unsubscribe))
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
