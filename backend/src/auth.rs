use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use chrono::{Duration, Utc};
use jsonwebtoken::{
    decode, encode, DecodingKey, EncodingKey, Header, Validation,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

// ---------- Mots de passe (Argon2id) ----------

pub fn hash_password(password: &str) -> ApiResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| ApiError::Internal)
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        // Hash mal formé en base : on log (corruption potentielle) et on refuse.
        Err(e) => {
            tracing::error!(error = ?e, "hash de mot de passe illisible en base");
            false
        }
    }
}

/// Hash Argon2id « leurre », calculé une fois, pour exécuter une vérification même
/// quand l'email est inconnu. Uniformise le temps de réponse du login : sans ça,
/// un email inexistant répond instantanément alors qu'un email connu paie un
/// Argon2 (~200 ms), révélant l'existence d'un compte par canal temporel (SEC-010).
fn dummy_hash() -> &'static str {
    static DUMMY: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    DUMMY.get_or_init(|| hash_password("pp-timing-dummy").unwrap_or_default())
}

/// Vérifie le mot de passe contre `hash` s'il existe, sinon contre le hash leurre
/// (temps de calcul comparable que le compte existe ou non). Renvoie toujours
/// `false` dans le cas leurre.
pub fn verify_login(password: &str, hash: Option<&str>) -> bool {
    match hash {
        Some(h) => verify_password(password, h),
        None => {
            let _ = verify_password(password, dummy_hash());
            false
        }
    }
}

// ---------- JWT ----------

/// Émetteur ET audience des jetons (SEC-014) : défense en profondeur contre un
/// jeton émis par une autre app partageant par erreur le même `JWT_SECRET`.
const JWT_ISS_AUD: &str = "pinkphone";

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: usize,
    /// Issued-at (epoch s) : pivot de la révocation par `users.min_token_iat`.
    pub iat: usize,
    pub iss: String,
    pub aud: String,
}

/// Émet un jeton valable 30 jours.
pub fn issue_token(secret: &str, user_id: Uuid) -> ApiResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        exp: (now + Duration::days(30)).timestamp() as usize,
        iat: now.timestamp() as usize,
        iss: JWT_ISS_AUD.into(),
        aud: JWT_ISS_AUD.into(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| ApiError::Internal)
}

/// Vérifie la signature, l'expiration, l'issuer et l'audience. Renvoie les claims.
pub fn verify_token(secret: &str, token: &str) -> ApiResult<Claims> {
    let mut validation = Validation::default();
    validation.set_issuer(&[JWT_ISS_AUD]);
    validation.set_audience(&[JWT_ISS_AUD]);
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|_| ApiError::Unauthorized)?;
    Ok(data.claims)
}

/// Authentifie une requête : jeton valide + non révoqué. Vérifie la signature
/// puis que le jeton a été émis APRÈS l'éventuelle borne de révocation de
/// l'utilisateur (`min_token_iat`, SEC-003). Renvoie l'id utilisateur.
pub async fn authenticate(state: &AppState, token: &str) -> ApiResult<Uuid> {
    let claims = verify_token(&state.config.jwt_secret, token)?;
    // Le compte doit exister, et le jeton ne pas être antérieur à une révocation.
    let min: Option<chrono::DateTime<Utc>> =
        sqlx::query_scalar("SELECT min_token_iat FROM users WHERE id = $1")
            .bind(claims.sub)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::Unauthorized)?;
    if let Some(min) = min {
        if (claims.iat as i64) < min.timestamp() {
            return Err(ApiError::Unauthorized);
        }
    }
    Ok(claims.sub)
}

// ---------- Extractor : l'utilisateur courant ----------

/// Présence d'un `Authorization: Bearer <jwt>` valide. Fournit l'id utilisateur.
pub struct AuthUser {
    pub user_id: Uuid,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(ApiError::Unauthorized)?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or(ApiError::Unauthorized)?;

        let user_id = authenticate(state, token).await?;
        Ok(AuthUser { user_id })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jwt_roundtrip_avec_iss_aud_iat() {
        let secret = "test-secret-at-least-32-characters-long!!";
        let uid = Uuid::new_v4();
        let token = issue_token(secret, uid).unwrap();
        let claims = verify_token(secret, &token).unwrap();
        assert_eq!(claims.sub, uid);
        assert_eq!(claims.iss, "pinkphone");
        assert_eq!(claims.aud, "pinkphone");
        assert!(claims.iat > 0 && claims.exp > claims.iat);
    }

    #[test]
    fn jwt_mauvais_secret_rejete() {
        let token = issue_token("secret-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Uuid::new_v4()).unwrap();
        assert!(verify_token("secret-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", &token).is_err());
    }

    #[test]
    fn jwt_mauvaise_audience_rejetee() {
        // Un jeton signé avec le bon secret mais une autre audience est refusé.
        let secret = "test-secret-at-least-32-characters-long!!";
        let claims = Claims {
            sub: Uuid::new_v4(),
            exp: (Utc::now() + Duration::days(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            iss: "autre-app".into(),
            aud: "autre-app".into(),
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();
        assert!(verify_token(secret, &token).is_err());
    }
}
