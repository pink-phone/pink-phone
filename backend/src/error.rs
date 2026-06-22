use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Erreur applicative uniforme. Se transforme en réponse JSON
/// `{ "error": <message lisible>, "code": <code machine stable> }` (API-15) : le
/// `message` peut être traduit/reformulé, le `code` est un identifiant stable que
/// le client peut tester sans dépendre du texte.
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

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden => StatusCode::FORBIDDEN,
            ApiError::NotFound => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Code machine stable (snake_case), indépendant du message (API-15).
    fn code(&self) -> &'static str {
        match self {
            ApiError::BadRequest(_) => "bad_request",
            ApiError::Unauthorized => "unauthorized",
            ApiError::Forbidden => "forbidden",
            ApiError::NotFound => "not_found",
            ApiError::Conflict(_) => "conflict",
            ApiError::Internal => "internal",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.code();
        let body = json!({ "error": self.to_string(), "code": code });
        (status, Json(body)).into_response()
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
