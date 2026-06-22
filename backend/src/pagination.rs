//! Pagination par curseur « keyset » (RUST-12 / API-11). Les listes croissantes
//! (posts, défis, commentaires) ne sont plus chargées d'un bloc : on renvoie une
//! page bornée + un drapeau `hasMore`, et le client redemande les éléments plus
//! anciens en passant le `created_at` du dernier reçu via `before`.
//!
//! Le curseur est le `created_at` (et non un OFFSET) : insensible aux insertions
//! concurrentes, donc pas de doublon ni de saut entre deux pages. À résolution
//! microseconde de Postgres, une collision exacte d'horodatage à la frontière de
//! page est négligeable pour cet usage (un couple) — on accepte ce compromis
//! plutôt qu'un curseur composite (created_at, id).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

const DEFAULT_LIMIT: i64 = 30;
const MAX_LIMIT: i64 = 100;

/// Paramètres de requête `?limit=&before=` communs aux listes paginées.
#[derive(Deserialize)]
pub struct PageParams {
    pub limit: Option<i64>,
    /// Borne haute exclusive : ne renvoyer que les éléments antérieurs (page suivante).
    pub before: Option<DateTime<Utc>>,
}

impl PageParams {
    /// Limite effective, bornée à `[1, MAX_LIMIT]`. On interroge volontairement
    /// `limit() + 1` lignes pour détecter `has_more` sans requête de comptage.
    pub fn limit(&self) -> i64 {
        self.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
    }
}

/// Page renvoyée au client : les éléments + s'il en reste d'autres au-delà.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub has_more: bool,
}

impl<T> Page<T> {
    /// `rows` contient jusqu'à `limit + 1` éléments (ordre déjà voulu) : on coupe
    /// au `limit` et déduit `has_more` du surplus.
    pub fn from_rows(mut rows: Vec<T>, limit: i64) -> Self {
        let has_more = rows.len() as i64 > limit;
        rows.truncate(limit as usize);
        Page {
            items: rows,
            has_more,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limite_bornee() {
        assert_eq!(PageParams { limit: None, before: None }.limit(), DEFAULT_LIMIT);
        assert_eq!(PageParams { limit: Some(0), before: None }.limit(), 1);
        assert_eq!(PageParams { limit: Some(9999), before: None }.limit(), MAX_LIMIT);
        assert_eq!(PageParams { limit: Some(10), before: None }.limit(), 10);
    }

    #[test]
    fn has_more_si_surplus() {
        // limit=2, on a fetché 3 (limit+1) → il en reste.
        let p = Page::from_rows(vec![1, 2, 3], 2);
        assert!(p.has_more);
        assert_eq!(p.items, vec![1, 2]);
        // Pile la limite, pas de surplus.
        let p = Page::from_rows(vec![1, 2], 2);
        assert!(!p.has_more);
        assert_eq!(p.items, vec![1, 2]);
    }
}
