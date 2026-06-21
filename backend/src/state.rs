use crate::config::Config;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Données d'un flux OIDC en cours, gardées entre /login et /callback.
pub struct OidcFlow {
    pub nonce: String,
    pub pkce_verifier: String,
    pub created: Instant,
}

/// Jeton de session en attente d'échange après un callback OIDC réussi. Le JWT
/// n'est PAS renvoyé dans l'URL (SEC-006) : le callback redirige avec un code
/// éphémère à usage unique, échangé contre ce jeton via POST. TTL très court.
pub struct LoginTicket {
    pub token: String,
    pub created: Instant,
}

/// Événement temps réel diffusé aux membres d'un espace (refresh instantané).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceEvent {
    pub space_id: Uuid,
    /// Auteur de la mutation : son propre client n'a pas besoin de rafraîchir.
    pub actor_id: Uuid,
    /// "post" | "challenge" | "mood" | "comment" | "reaction".
    pub kind: String,
}

/// État partagé injecté dans tous les handlers.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    /// Client HTTP réutilisable (discovery OIDC, échange de code, JWKS).
    pub http: reqwest::Client,
    /// États OIDC en cours, indexés par `state` (anti-CSRF). TTL court.
    pub oidc_states: Arc<Mutex<HashMap<String, OidcFlow>>>,
    /// Jetons en attente d'échange post-callback OIDC, indexés par code éphémère.
    pub oidc_tickets: Arc<Mutex<HashMap<String, LoginTicket>>>,
    /// Bus d'événements temps réel (alimente les WebSockets par espace).
    pub events: broadcast::Sender<SpaceEvent>,
}

impl AppState {
    /// Diffuse un événement de mutation aux WebSockets connectés (best-effort :
    /// ignoré s'il n'y a aucun abonné).
    pub fn emit(&self, space_id: Uuid, actor_id: Uuid, kind: &str) {
        let _ = self.events.send(SpaceEvent {
            space_id,
            actor_id,
            kind: kind.to_string(),
        });
    }
}
