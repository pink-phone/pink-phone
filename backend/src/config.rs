use std::env;

/// Configuration runtime, lue depuis l'environnement (.env).
#[derive(Clone)]
pub struct Config {
    /// DSN complet (utilisé tel quel s'il est fourni — pratique en dev).
    /// Vide en prod : on construit la connexion à partir des champs `db_*`
    /// pour ne pas casser sur un mot de passe contenant des caractères spéciaux.
    pub database_url: String,
    pub db_host: String,
    pub db_port: u16,
    pub db_user: String,
    pub db_password: String,
    pub db_name: String,
    pub jwt_secret: String,
    pub media_dir: String,
    /// Clé de chiffrement des médias au repos (base64 de 32 octets). Vide =>
    /// médias stockés en clair (dev / rétrocompat).
    pub media_key: String,
    pub bind_addr: String,
    pub cors_origin: String,
    /// Clés VAPID pour le Web Push (base64 url-safe sans padding).
    /// Vides => l'envoi push est désactivé (les préférences restent stockées).
    pub vapid_public_key: String,
    pub vapid_private_key: String,
    pub vapid_subject: String,
    /// Auth email/mot de passe activée (sinon : OIDC uniquement).
    pub password_auth_enabled: bool,
    /// OIDC (vides => SSO désactivé).
    pub oidc_issuer: String,
    pub oidc_client_id: String,
    pub oidc_client_secret: String,
    /// URL de callback (cette API) enregistrée côté fournisseur.
    pub oidc_redirect_uri: String,
    /// Où renvoyer le navigateur après login (le front), avec le token en fragment.
    pub oidc_post_login_redirect: String,
}

impl Config {
    /// Clé média décodée (32 octets) si `MEDIA_KEY` est un base64 valide.
    pub fn media_key_bytes(&self) -> Option<[u8; 32]> {
        decode_media_key(&self.media_key)
    }

    pub fn oidc_enabled(&self) -> bool {
        !self.oidc_issuer.is_empty()
            && !self.oidc_client_id.is_empty()
            && !self.oidc_client_secret.is_empty()
            && !self.oidc_redirect_uri.is_empty()
    }
}

/// Décode une clé média (base64 standard → 32 octets). `None` si vide ou invalide.
/// Partagé par `media_key_bytes` et la rotation de clé (`MEDIA_KEY_NEW`).
pub fn decode_media_key(raw: &str) -> Option<[u8; 32]> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    STANDARD.decode(raw).ok()?.try_into().ok()
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").unwrap_or_default(),
            db_host: env::var("DB_HOST").unwrap_or_else(|_| "localhost".into()),
            db_port: env::var("DB_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5432),
            db_user: env::var("DB_USER").unwrap_or_else(|_| "pink".into()),
            db_password: env::var("DB_PASSWORD").unwrap_or_else(|_| "pink".into()),
            db_name: env::var("DB_NAME").unwrap_or_else(|_| "pinkphone".into()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-insecure-secret".into()),
            media_dir: env::var("MEDIA_DIR").unwrap_or_else(|_| "./media-store".into()),
            media_key: env::var("MEDIA_KEY").unwrap_or_default(),
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into()),
            cors_origin: env::var("CORS_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:5173".into()),
            vapid_public_key: env::var("VAPID_PUBLIC_KEY").unwrap_or_default(),
            vapid_private_key: env::var("VAPID_PRIVATE_KEY").unwrap_or_default(),
            vapid_subject: env::var("VAPID_SUBJECT")
                .unwrap_or_else(|_| "mailto:admin@example.com".into()),
            password_auth_enabled: env::var("PASSWORD_AUTH_ENABLED")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            oidc_issuer: env::var("OIDC_ISSUER").unwrap_or_default(),
            oidc_client_id: env::var("OIDC_CLIENT_ID").unwrap_or_default(),
            oidc_client_secret: env::var("OIDC_CLIENT_SECRET").unwrap_or_default(),
            oidc_redirect_uri: env::var("OIDC_REDIRECT_URI").unwrap_or_default(),
            oidc_post_login_redirect: env::var("OIDC_POST_LOGIN_REDIRECT")
                .or_else(|_| env::var("CORS_ORIGIN"))
                .unwrap_or_else(|_| "http://localhost:5173".into()),
        }
    }
}
