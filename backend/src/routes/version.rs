//! Version du build de l'API, injectée à la compilation par le pipeline de
//! release (`APP_VERSION` / `APP_COMMIT`, cf. `backend/Dockerfile`).
//!
//! Route publique (comme `/api/auth/config`) : elle ne révèle que la version de
//! l'application et le commit source — pas celle des dépendances — et sert de
//! signal exact aux vérifications de déploiement.

use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::state::AppState;

/// Version affichée : `0.0.147` (Forgejo), `gh-1.4.0` (GitHub), `beta`, `ci`…
/// `dev` hors pipeline (build local, `cargo run`).
pub const VERSION: &str = match option_env!("APP_VERSION") {
    Some(v) if !v.is_empty() => v,
    _ => "dev",
};

/// SHA complet du commit source ; vide hors pipeline. Le SHA Forgejo et celui du
/// miroir GitHub d'un même commit diffèrent (historique réécrit) : c'est bien le
/// commit du dépôt qui a construit l'image.
pub const COMMIT: &str = match option_env!("APP_COMMIT") {
    Some(c) => c,
    None => "",
};

#[derive(Serialize)]
pub struct BuildInfo {
    pub version: &'static str,
    pub commit: &'static str,
}

pub fn build_info() -> BuildInfo {
    BuildInfo {
        version: VERSION,
        commit: COMMIT,
    }
}

async fn version() -> Json<BuildInfo> {
    Json(build_info())
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/version", get(version))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Le build d'image définit APP_VERSION avant `cargo test --release` : on ne
    // peut donc pas exiger « dev » ici, seulement une valeur exploitable.
    #[test]
    fn version_jamais_vide() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn build_info_reprend_les_constantes() {
        let b = build_info();
        assert_eq!(b.version, VERSION);
        assert_eq!(b.commit, COMMIT);
    }

    #[test]
    fn json_compact_avec_les_deux_champs() {
        // Le check de déploiement (deploy.yml) cherche `"version":"…"` dans le
        // JSON compact : on verrouille cette forme.
        let s = serde_json::to_string(&build_info()).unwrap();
        assert!(s.starts_with(&format!("{{\"version\":\"{VERSION}\"")), "{s}");
        assert!(s.contains("\"commit\":\""), "{s}");
    }
}
