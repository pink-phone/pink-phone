use crate::config::Config;
use jsonwebtoken::jwk::JwkSet;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::broadcast;
use uuid::Uuid;
use web_push::HyperWebPushClient;

/// Données d'un flux OIDC en cours, gardées entre /login et /callback.
pub struct OidcFlow {
    pub nonce: String,
    pub pkce_verifier: String,
    pub created: Instant,
}

/// Endpoints OIDC résolus par la discovery (`.well-known/openid-configuration`).
#[derive(Clone)]
pub struct OidcMeta {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
}

/// Cache de la discovery OIDC + du JWKS (RUST-04). Évite 2 requêtes HTTP par
/// login/callback et amortit une indisponibilité passagère du provider. Le TTL
/// borne la fraîcheur : une rotation d'endpoints/clés côté IdP est reprise au plus
/// tard après expiration (et tout de suite si un `kid` est absent — cf. oidc.rs).
pub struct OidcCache {
    pub meta: OidcMeta,
    pub jwks: JwkSet,
    pub fetched: Instant,
}

/// Jeton de session en attente d'échange après un callback OIDC réussi. Le JWT
/// n'est PAS renvoyé dans l'URL (SEC-006) : le callback redirige avec un code
/// éphémère à usage unique, échangé contre ce jeton via POST. TTL très court.
pub struct LoginTicket {
    pub token: String,
    pub created: Instant,
}

/// Nature d'une mutation diffusée en temps réel. Sérialisé en chaîne (camelCase)
/// dans le JSON WebSocket : le contrat avec le frontend reste identique, mais le
/// jeu de valeurs est désormais fermé côté Rust — impossible d'émettre un libellé
/// inconnu (RUST-10, sûreté de type). `Copy` → pas d'allocation par événement.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EventKind {
    Post,
    Challenge,
    Mood,
    Comment,
    Reaction,
    Seen,
    Space,
    Desire,
    EveningMenu,
}

/// Événement temps réel diffusé aux membres d'un espace (refresh instantané).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceEvent {
    pub space_id: Uuid,
    /// Auteur de la mutation : son propre client n'a pas besoin de rafraîchir.
    pub actor_id: Uuid,
    pub kind: EventKind,
}

/// État partagé injecté dans tous les handlers. `config` et `push_client` sont des
/// `Arc` → `AppState::clone` (par requête) reste O(1) (RUST-08/03).
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    /// Client HTTP réutilisable (discovery OIDC, échange de code, JWKS).
    pub http: reqwest::Client,
    /// Client Web Push réutilisable (connexions HTTP/TLS amorties — RUST-03).
    pub push_client: Arc<HyperWebPushClient>,
    /// États OIDC en cours, indexés par `state` (anti-CSRF). TTL court.
    pub oidc_states: Arc<Mutex<HashMap<String, OidcFlow>>>,
    /// Jetons en attente d'échange post-callback OIDC, indexés par code éphémère.
    pub oidc_tickets: Arc<Mutex<HashMap<String, LoginTicket>>>,
    /// Discovery + JWKS mis en cache (TTL) — voir `OidcCache` (RUST-04).
    pub oidc_cache: Arc<Mutex<Option<OidcCache>>>,
    /// Bus d'événements temps réel (alimente les WebSockets par espace).
    pub events: broadcast::Sender<SpaceEvent>,
}

impl AppState {
    /// Diffuse un événement de mutation aux WebSockets connectés (best-effort :
    /// ignoré s'il n'y a aucun abonné).
    pub fn emit(&self, space_id: Uuid, actor_id: Uuid, kind: EventKind) {
        let _ = self.events.send(SpaceEvent {
            space_id,
            actor_id,
            kind,
        });
    }
}
