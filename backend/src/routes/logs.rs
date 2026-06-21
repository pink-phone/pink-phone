use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::AuthUser;

/// Remontée des logs du front (erreurs JS, rejets non gérés, échecs d'API) vers
/// les logs du serveur — utile pour déboguer à distance, surtout sur iOS où
/// l'inspection est pénible. On NE persiste rien : tout part dans `tracing`
/// (visible via `docker logs`), authentifié pour éviter le spam anonyme.
/// Confidentialité : le front n'envoie que des diagnostics (message, contexte,
/// user-agent), jamais le contenu intime des posts/médias.
pub fn router() -> Router<crate::state::AppState> {
    Router::new().route("/api/logs", post(ingest))
}

#[derive(Deserialize)]
struct ClientLog {
    level: Option<String>,
    message: String,
    context: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientLogBatch {
    entries: Vec<ClientLog>,
    user_agent: Option<String>,
}

/// Tronque une chaîne à `max` octets (sur une frontière de caractère) pour
/// éviter qu'un message géant ne pollue les logs serveur.
fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

async fn ingest(auth: AuthUser, Json(batch): Json<ClientLogBatch>) -> StatusCode {
    let ua = batch.user_agent.as_deref().map(|u| truncate(u, 256));
    // Borne le lot pour éviter d'inonder les logs depuis un client compromis.
    for entry in batch.entries.iter().take(50) {
        let level = entry.level.as_deref().unwrap_or("error");
        let message = truncate(&entry.message, 2000);
        let context = entry.context.as_deref().map(|c| truncate(c, 512));
        tracing::warn!(
            target: "client",
            user = %auth.user_id,
            level,
            context = ?context,
            user_agent = ?ua,
            "log client : {message}"
        );
    }
    StatusCode::NO_CONTENT
}
