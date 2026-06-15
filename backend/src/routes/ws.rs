use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;
use uuid::Uuid;

use crate::auth::verify_token;
use crate::error::ApiError;
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/spaces/{id}/ws", get(ws_handler))
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

/// WebSocket de refresh temps réel pour un espace. Le navigateur ne posant pas
/// d'en-tête Authorization sur le handshake WS, le jeton passe en query.
async fn ws_handler(
    State(state): State<AppState>,
    Path(space_id): Path<Uuid>,
    Query(q): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let user_id = verify_token(&state.config.jwt_secret, &q.token)?;
    ensure_member(&state.pool, user_id, space_id).await?;
    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, space_id, user_id)))
}

async fn handle_socket(mut socket: WebSocket, state: AppState, space_id: Uuid, user_id: Uuid) {
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
