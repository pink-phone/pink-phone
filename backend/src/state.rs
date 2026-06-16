use crate::config::Config;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Données d'un flux OIDC en cours, gardées entre /login et /callback.
pub struct OidcFlow {
    pub nonce: String,
    pub pkce_verifier: String,
    pub created: Instant,
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
}
