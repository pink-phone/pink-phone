use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Erreur applicative uniforme. Se transforme en réponse JSON `{ "error": ... }`.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    BadRequest(String),
    #[error("identifiants invalides")]
    Unauthorized,
    #[error("accès refusé")]
    Forbidden,
    #[error("introuvable")]
    NotFound,
    #[error("{0}")]
    Conflict(String),
    #[error("erreur interne")]
    Internal,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden => StatusCode::FORBIDDEN,
            ApiError::NotFound => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}

/// Les erreurs SQL inattendues deviennent des 500 (et sont journalisées).
impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => ApiError::NotFound,
            other => {
                tracing::error!(error = ?other, "erreur base de données");
                ApiError::Internal
            }
        }
    }
}

/// Les erreurs réseau (discovery OIDC, échange de code, JWKS) deviennent des 500.
impl From<reqwest::Error> for ApiError {
    fn from(err: reqwest::Error) -> Self {
        tracing::error!(error = ?err, "erreur HTTP sortante");
        ApiError::Internal
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
