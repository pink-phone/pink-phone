//! Limitation de débit et de ressources en mémoire (process-local).
//!
//! Deux mécanismes complémentaires :
//! - [`RateLimiter`] : fenêtre glissante par clé, protège les endpoints propices
//!   au brute-force (login/register/join-by-invite/upload, SECURITY_FINDINGS.md
//!   #1-2/#13) — sans ça, rien ne borne le nombre de tentatives.
//! - [`ConnectionTracker`] : plafonne les connexions WebSocket SIMULTANÉES par
//!   utilisateur (SECURITY_FINDINGS.md #15) — un débit d'ouverture sous le seuil
//!   du `RateLimiter` peut quand même accumuler un nombre illimité de connexions
//!   ouvertes en parallèle, chacune coûtant une tâche + un descripteur de fichier
//!   pour la durée de vie de la session.
//!
//! Même approche « TTL/compteur en mémoire, purgé au fil de l'eau » que les flux
//! OIDC (`state.rs::OidcFlow`/`LoginTicket`) — pas de dépendance externe (Redis…)
//! pour un besoin aussi simple. Limite connue, commune aux deux mécanismes : ne
//! fonctionne qu'à un seul process ; un déploiement multi-réplicas de l'API
//! partagerait un compteur par réplica (pas de garantie globale). Acceptable
//! pour l'échelle visée (une instance par couple/petit groupe) ; à revoir si
//! l'API est un jour répliquée horizontalement.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;

/// Nombre de clés distinctes au-delà duquel on déclenche une purge (coût amorti) :
/// borne la mémoire même si beaucoup de clés n'ont plus jamais de nouvelle tentative.
const CLEANUP_THRESHOLD: usize = 10_000;

/// Plafond DUR (SECURITY_FINDINGS.md #12, CWE-400) : la purge ci-dessus ne retire
/// que les clés devenues inactives — un flot d'IP TOUJOURS NOUVELLES (trivial en
/// IPv6, un attaquant possédant un /64 dispose de 2^64 adresses) ne redevient
/// jamais « inactif » pendant l'attaque et ferait grossir la table sans borne,
/// épuisant la mémoire du process. Ironique pour un composant conçu pour limiter
/// justement ce type d'abus. Au-delà de ce plafond, on évince les clés les moins
/// récemment actives (LRU approximatif) plutôt que de laisser croître la table.
const HARD_CAP: usize = 50_000;

/// Marge d'éviction : une fois le plafond dépassé, on évince jusqu'à redescendre
/// à `HARD_CAP - HARD_CAP_MARGIN` plutôt que juste sous le plafond — sans cette
/// marge, l'insertion suivante retombe pile sur le seuil et redéclenche un tri
/// O(n log n) à CHAQUE appel sous une charge soutenue (testé : ~50 s pour 500
/// insertions en trop sans la marge ET l'amortissement ci-dessous — un comble
/// pour un composant anti-DoS). Avec la marge, la maintenance ne se redéclenche
/// qu'après plusieurs milliers de nouvelles clés.
const HARD_CAP_MARGIN: usize = HARD_CAP / 10;

/// N'exécute la purge/éviction (potentiellement coûteuses) qu'une fois toutes
/// les `MAINTENANCE_INTERVAL` requêtes plutôt qu'à chaque appel une fois les
/// seuils franchis — sans cet amortissement, un flot soutenu de clés nouvelles
/// ferait retrigger le tri O(n log n) sur CHAQUE requête de TOUTE l'API (le
/// mutex est partagé par tous les endpoints rate-limités), un comble pour un
/// composant anti-DoS.
const MAINTENANCE_INTERVAL: usize = 256;

#[derive(Default)]
struct Hits {
    map: HashMap<String, Vec<Instant>>,
    calls_since_maintenance: usize,
}

/// Compteur à fenêtre glissante partagé par plusieurs endpoints via une clé
/// composite (ex. `"login:203.0.113.4"`) : un unique `RateLimiter` dans `AppState`
/// suffit pour toute l'API plutôt qu'une instance par route.
#[derive(Default)]
pub struct RateLimiter {
    hits: Mutex<Hits>,
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
        let mut state = self.hits.lock().unwrap();

        state.calls_since_maintenance += 1;
        if state.calls_since_maintenance >= MAINTENANCE_INTERVAL {
            state.calls_since_maintenance = 0;
            if state.map.len() > CLEANUP_THRESHOLD {
                state.map.retain(|_, times| {
                    times.last().is_some_and(|t| now.duration_since(*t) < window)
                });
            }
            let len = state.map.len();
            if len >= HARD_CAP {
                Self::evict_oldest(&mut state.map, len - (HARD_CAP - HARD_CAP_MARGIN));
            }
        }

        let times = state.map.entry(key.to_string()).or_default();
        times.retain(|t| now.duration_since(*t) < window);
        let limited = times.len() >= max;
        if !limited {
            times.push(now);
        }
        limited
    }

    /// Retire les `n` clés les moins récemment actives (LRU approximatif, coût
    /// O(n log n) — amorti sur `MAINTENANCE_INTERVAL` appels, cf. plus haut).
    fn evict_oldest(hits: &mut HashMap<String, Vec<Instant>>, n: usize) {
        let mut by_last_activity: Vec<(String, Instant)> = hits
            .iter()
            .map(|(k, times)| (k.clone(), times.last().copied().unwrap_or_else(Instant::now)))
            .collect();
        by_last_activity.sort_by_key(|(_, t)| *t);
        for (key, _) in by_last_activity.into_iter().take(n) {
            hits.remove(&key);
        }
    }
}

/// Plafonne les connexions WebSocket SIMULTANÉES par utilisateur
/// (SECURITY_FINDINGS.md #15, CWE-400) : `is_limited` borne le DÉBIT de
/// nouvelles tentatives, mais une connexion WS reste ouverte des heures — un
/// flot de tentatives largement sous le seuil de débit accumule quand même un
/// nombre illimité de connexions ouvertes en simultané (chacune = 1 tâche
/// tokio + 1 `broadcast::Receiver` + 1 descripteur de fichier ; le fan-out de
/// `AppState::emit` coûte O(nombre d'abonnés), donc un flot de connexions
/// ralentit la diffusion des événements pour TOUT LE MONDE, pas seulement
/// l'attaquant). Confirmé en direct (bug bounty) : 200 connexions concurrentes
/// depuis une seule identité, toutes acceptées, sans aucun frein.
pub struct ConnectionTracker {
    counts: Mutex<HashMap<Uuid, usize>>,
}

/// Décrémente le compteur au `Drop`, quelle que soit la façon dont la
/// connexion se termine (fermeture propre, erreur, timeout…) — pas de fuite de
/// compteur possible en oubliant un site de sortie de `handle_socket`.
pub struct ConnectionGuard {
    tracker: Arc<ConnectionTracker>,
    user_id: Uuid,
}

impl Default for ConnectionTracker {
    fn default() -> Self {
        Self { counts: Mutex::new(HashMap::new()) }
    }
}

impl ConnectionTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Tente de réserver une connexion pour `user_id`. `None` si `user_id` a
    /// déjà `max` connexions ouvertes (l'appelant doit refuser l'upgrade, 429).
    pub fn try_acquire(
        tracker: Arc<Self>,
        user_id: Uuid,
        max: usize,
    ) -> Option<ConnectionGuard> {
        let mut counts = tracker.counts.lock().unwrap();
        let entry = counts.entry(user_id).or_insert(0);
        if *entry >= max {
            return None;
        }
        *entry += 1;
        drop(counts);
        Some(ConnectionGuard { tracker, user_id })
    }
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        let mut counts = self.tracker.counts.lock().unwrap();
        if let Some(c) = counts.get_mut(&self.user_id) {
            *c = c.saturating_sub(1);
            if *c == 0 {
                counts.remove(&self.user_id);
            }
        }
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
        let state = rl.hits.lock().unwrap();
        assert_eq!(state.map.get("k").map(Vec::len), Some(2));
    }

    /// SECURITY_FINDINGS.md #12 : un flot de clés TOUJOURS NOUVELLES (IP
    /// distinctes, ex. IPv6) ne doit pas faire grossir la table sans borne — le
    /// plafond dur doit tenir (à la marge de l'amortissement près, cf.
    /// `MAINTENANCE_INTERVAL`) même quand aucune clé n'est jamais « inactive »
    /// (fenêtre longue, toutes les tentatives sont récentes).
    #[test]
    fn plafond_dur_tient_sous_un_flot_de_cles_toujours_nouvelles() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(3600);
        for i in 0..(HARD_CAP + 5 * MAINTENANCE_INTERVAL) {
            rl.is_limited(&format!("ip-{i}"), 5, window);
        }
        let state = rl.hits.lock().unwrap();
        let max_expected = HARD_CAP + MAINTENANCE_INTERVAL; // marge de l'amortissement
        assert!(
            state.map.len() <= max_expected,
            "la table ({} clés) doit rester bornée (≤ {max_expected})",
            state.map.len()
        );
    }

    /// SECURITY_FINDINGS.md #15 : confirmé en direct (200 connexions WS
    /// concurrentes acceptées depuis une seule identité) — le plafond doit
    /// refuser toute tentative au-delà de `max`.
    #[test]
    fn connection_tracker_plafonne_par_utilisateur() {
        let tracker = Arc::new(ConnectionTracker::new());
        let user = Uuid::new_v4();
        let mut guards = Vec::new();
        for i in 0..3 {
            let g = ConnectionTracker::try_acquire(tracker.clone(), user, 3);
            assert!(g.is_some(), "connexion {i} devrait être acceptée (sous le plafond)");
            guards.push(g);
        }
        assert!(
            ConnectionTracker::try_acquire(tracker.clone(), user, 3).is_none(),
            "la 4e connexion doit être refusée (plafond atteint)"
        );
    }

    #[test]
    fn connection_tracker_independant_par_utilisateur() {
        let tracker = Arc::new(ConnectionTracker::new());
        let alice = Uuid::new_v4();
        let bob = Uuid::new_v4();
        let _a = ConnectionTracker::try_acquire(tracker.clone(), alice, 1).unwrap();
        // Alice est au plafond, mais Bob a son propre compteur : pas affecté.
        assert!(ConnectionTracker::try_acquire(tracker.clone(), bob, 1).is_some());
    }

    #[test]
    fn connection_tracker_libere_la_place_au_drop() {
        let tracker = Arc::new(ConnectionTracker::new());
        let user = Uuid::new_v4();
        let guard = ConnectionTracker::try_acquire(tracker.clone(), user, 1).unwrap();
        assert!(
            ConnectionTracker::try_acquire(tracker.clone(), user, 1).is_none(),
            "plafond atteint (1/1)"
        );
        drop(guard); // simule la déconnexion (fermeture propre, erreur, timeout…)
        assert!(
            ConnectionTracker::try_acquire(tracker.clone(), user, 1).is_some(),
            "la place doit être libérée après le Drop du guard"
        );
    }
}
