//! Crate bibliothèque de l'API PinkPhone : regroupe les modules partagés par le
//! binaire serveur (`main.rs`) et l'outil d'administration (`bin/pinkctl.rs`).

pub mod auth;
pub mod config;
pub mod error;
pub mod invite_code;
pub mod models;
pub mod notifications;
pub mod pagination;
pub mod rate_limit;
pub mod routes;
pub mod state;

// Tests d'intégration (routes + SQL) sur une vraie Postgres jetable, gated par la
// feature `integration` (cf. Cargo.toml) → exclus du `cargo test` no-DB.
#[cfg(all(test, feature = "integration"))]
mod tests_integration;
