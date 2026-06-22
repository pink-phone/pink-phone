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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    /// Vérifie que chaque variante d'`ApiError` produit le bon code HTTP et le
    /// bon code machine stable (API-15). Tests purement en mémoire, aucune DB.
    #[test]
    fn status_and_code_mappings() {
        // BadRequest
        let e = ApiError::BadRequest("champ requis".into());
        assert_eq!(e.status(), StatusCode::BAD_REQUEST, "BadRequest status");
        assert_eq!(e.code(), "bad_request", "BadRequest code");

        // Unauthorized
        assert_eq!(ApiError::Unauthorized.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(ApiError::Unauthorized.code(), "unauthorized");

        // Forbidden
        assert_eq!(ApiError::Forbidden.status(), StatusCode::FORBIDDEN);
        assert_eq!(ApiError::Forbidden.code(), "forbidden");

        // NotFound
        assert_eq!(ApiError::NotFound.status(), StatusCode::NOT_FOUND);
        assert_eq!(ApiError::NotFound.code(), "not_found");

        // Conflict
        let e = ApiError::Conflict("doublon".into());
        assert_eq!(e.status(), StatusCode::CONFLICT, "Conflict status");
        assert_eq!(e.code(), "conflict", "Conflict code");

        // Internal
        assert_eq!(
            ApiError::Internal.status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(ApiError::Internal.code(), "internal");
    }

    /// Les messages d'erreur des variantes à payload sont transmis tels quels.
    #[test]
    fn passthrough_messages() {
        assert_eq!(
            ApiError::BadRequest("champ requis".into()).to_string(),
            "champ requis"
        );
        assert_eq!(
            ApiError::Conflict("doublon".into()).to_string(),
            "doublon"
        );
    }

    /// Les messages fixes des variantes sans payload sont stables (contrat API).
    #[test]
    fn fixed_messages() {
        assert_eq!(ApiError::Unauthorized.to_string(), "identifiants invalides");
        assert_eq!(ApiError::Forbidden.to_string(), "accès refusé");
        assert_eq!(ApiError::NotFound.to_string(), "introuvable");
        assert_eq!(ApiError::Internal.to_string(), "erreur interne");
    }

    /// sqlx::Error::RowNotFound se traduit en ApiError::NotFound (sans DB).
    #[test]
    fn sqlx_row_not_found_maps_to_not_found() {
        let api_err = ApiError::from(sqlx::Error::RowNotFound);
        assert!(
            matches!(api_err, ApiError::NotFound),
            "RowNotFound doit devenir NotFound"
        );
    }
}
