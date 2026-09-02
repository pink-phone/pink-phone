use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;
use uuid::Uuid;

use crate::auth::authenticate;
use crate::error::ApiError;
use crate::rate_limit::{ClientIp, ConnectionGuard, ConnectionTracker};
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/spaces/{id}/ws", get(ws_handler))
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

/// Rate limiting des tentatives d'ouverture (débit) + plafond de connexions
/// simultanées par utilisateur (SECURITY_FINDINGS.md #15) : confirmé en direct
/// (bug bounty), 200 connexions WS concurrentes depuis une seule identité
/// étaient acceptées sans aucun frein. Le plafond de simultanéité est
/// volontairement généreux (téléphone + tablette + ordinateur + plusieurs
/// onglets) : il vise l'automatisation abusive, pas l'usage normal.
const WS_MAX_ATTEMPTS: usize = 20;
const WS_WINDOW: Duration = Duration::from_secs(60);
const WS_MAX_CONCURRENT_PER_USER: usize = 10;

/// WebSocket de refresh temps réel pour un espace. Le navigateur ne posant pas
/// d'en-tête Authorization sur le handshake WS, le jeton passe en query.
async fn ws_handler(
    State(state): State<AppState>,
    ip: ClientIp,
    Path(space_id): Path<Uuid>,
    Query(q): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let user_id = authenticate(&state, &q.token).await?;
    ensure_member(&state.pool, user_id, space_id).await?;

    if state
        .rate_limiter
        .is_limited(&format!("ws:ip:{}", ip.0), WS_MAX_ATTEMPTS, WS_WINDOW)
        || state.rate_limiter.is_limited(
            &format!("ws:user:{user_id}"),
            WS_MAX_ATTEMPTS,
            WS_WINDOW,
        )
    {
        return Err(ApiError::TooManyRequests(
            "trop de tentatives de connexion, réessaie dans une minute".into(),
        ));
    }
    let guard = ConnectionTracker::try_acquire(
        state.ws_connections.clone(),
        user_id,
        WS_MAX_CONCURRENT_PER_USER,
    )
    .ok_or_else(|| {
        ApiError::TooManyRequests("trop de connexions temps réel simultanées".into())
    })?;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, space_id, user_id, guard)))
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
    space_id: Uuid,
    user_id: Uuid,
    _guard: ConnectionGuard,
) {
    // `_guard` décrémente le compteur de connexions à son Drop, quel que soit
    // le chemin de sortie de cette fonction (fin de boucle ci-dessous).
    let mut rx = state.events.subscribe();
    loop {
        tokio::select! {
            ev = rx.recv() => match ev {
                // On ne renvoie pas ses propres mutations (déjà appliquées côté client).
                Ok(ev) if ev.space_id == space_id && ev.actor_id != user_id => {
                    match serde_json::to_string(&ev) {
                        Ok(text) => {
                            if socket.send(Message::Text(text.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => {}
                    }
                }
                Ok(_) => {}
                Err(RecvError::Lagged(_)) => {} // trop d'événements ratés : on continue
                Err(RecvError::Closed) => break,
            },
            // On lit les messages entrants uniquement pour détecter la fermeture.
            msg = socket.recv() => match msg {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            },
        }
    }
}
