//! Limitation de débit en mémoire (process-local), fenêtre glissante par clé.
//!
//! Protège les endpoints propices au brute-force (login/register/join-by-invite,
//! SECURITY_FINDINGS.md #1-2) : sans ça, rien ne borne le nombre de tentatives.
//! Même approche « TTL en mémoire, purgé au fil de l'eau » que les flux OIDC
//! (`state.rs::OidcFlow`/`LoginTicket`) — pas de dépendance externe (Redis…) pour
//! un besoin aussi simple. Limite connue : ne fonctionne qu'à un seul process ; un
//! déploiement multi-réplicas de l'API partagerait un compteur par réplica (pas de
//! garantie globale). Acceptable pour l'échelle visée (une instance par couple/petit
//! groupe) ; à revoir si l'API est un jour répliquée horizontalement.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;

use crate::error::ApiError;
use crate::state::AppState;

/// Nombre de clés distinctes au-delà duquel on déclenche une purge (coût amorti) :
/// borne la mémoire même si beaucoup de clés n'ont plus jamais de nouvelle tentative.
const CLEANUP_THRESHOLD: usize = 10_000;

/// Compteur à fenêtre glissante partagé par plusieurs endpoints via une clé
/// composite (ex. `"login:203.0.113.4"`) : un unique `RateLimiter` dans `AppState`
/// suffit pour toute l'API plutôt qu'une instance par route.
#[derive(Default)]
pub struct RateLimiter {
    hits: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Enregistre une tentative pour `key` et renvoie `true` si `key` a déjà
    /// atteint `max` tentatives dans les `window` dernières secondes (⇒ appelant
    /// doit refuser, 429). Ne compte PAS la tentative en cours si elle est déjà
    /// limitée (évite qu'un client qui insiste fasse grossir le vecteur sans
    /// borne — il reste plafonné à `max` entrées par clé).
    pub fn is_limited(&self, key: &str, max: usize, window: Duration) -> bool {
        let now = Instant::now();
        let mut hits = self.hits.lock().unwrap();

        if hits.len() > CLEANUP_THRESHOLD {
            hits.retain(|_, times| {
                times.last().is_some_and(|t| now.duration_since(*t) < window)
            });
        }

        let times = hits.entry(key.to_string()).or_default();
        times.retain(|t| now.duration_since(*t) < window);
        let limited = times.len() >= max;
        if !limited {
            times.push(now);
        }
        limited
    }
}

/// IP cliente, utilisée comme clé de rate limiting. Fait confiance à l'en-tête
/// `X-Real-IP` — posé par NOTRE reverse-proxy nginx (`frontend/nginx.conf`,
/// `proxy_set_header X-Real-IP $remote_addr` sur `/api/`) — et retombe sur
/// l'adresse de connexion TCP directe sinon (dev sans proxy, ou tout déploiement
/// où l'API est jointe directement).
///
/// ATTENTION : si un reverse-proxy TIERS est mis devant l'API sans réécrire cet
/// en-tête (ou en le laissant passer tel quel depuis le client), une IP source
/// peut être falsifiée et contourner le rate limiting par IP — documenté dans
/// INSTALL.md pour les auto-hébergeurs utilisant leur propre proxy.
pub struct ClientIp(pub IpAddr);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        if let Some(ip) = parts
            .headers
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.trim().parse::<IpAddr>().ok())
        {
            return Ok(ClientIp(ip));
        }
        let connect_info = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .ok_or(ApiError::Internal)?;
        Ok(ClientIp(connect_info.0.ip()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sous_la_limite_autorise() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        assert!(!rl.is_limited("k", 3, window));
        assert!(!rl.is_limited("k", 3, window));
        assert!(!rl.is_limited("k", 3, window));
        // 4e tentative dans la fenêtre : refusée.
        assert!(rl.is_limited("k", 3, window));
    }

    #[test]
    fn cles_independantes() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        for _ in 0..3 {
            assert!(!rl.is_limited("a", 3, window));
        }
        // "b" a son propre compteur : pas affectée par "a".
        assert!(!rl.is_limited("b", 3, window));
    }

    #[test]
    fn fenetre_glissante_libere_apres_expiration() {
        let rl = RateLimiter::new();
        let window = Duration::from_millis(30);
        assert!(!rl.is_limited("k", 1, window));
        assert!(rl.is_limited("k", 1, window)); // encore dans la fenêtre
        std::thread::sleep(Duration::from_millis(50));
        assert!(!rl.is_limited("k", 1, window)); // fenêtre expirée : de nouveau autorisé
    }

    #[test]
    fn tentative_refusee_non_comptee_en_plus() {
        // Une clé martelée bien au-delà de `max` reste plafonnée à `max` entrées
        // (pas de croissance non bornée du vecteur).
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        for _ in 0..50 {
            rl.is_limited("k", 2, window);
        }
        let hits = rl.hits.lock().unwrap();
        assert_eq!(hits.get("k").map(Vec::len), Some(2));
    }
}
