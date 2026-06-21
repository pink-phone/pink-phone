use serde_json::json;
use uuid::Uuid;
use web_push::{
    ContentEncoding, HyperWebPushClient, SubscriptionInfo, VapidSignatureBuilder,
    WebPushClient, WebPushError, WebPushMessageBuilder, URL_SAFE_NO_PAD,
};

use crate::state::AppState;

#[derive(sqlx::FromRow)]
struct SubRow {
    endpoint: String,
    p256dh: String,
    auth: String,
}

/// Corps générique des notifications push : le contenu intime (titre de récit,
/// aperçu de commentaire, humeur précise) ne doit JAMAIS apparaître sur l'écran
/// de verrouillage (SEC-012). On notifie le *type* d'événement via `title`, et on
/// invite à ouvrir l'app — le contenu se découvre dans l'app authentifiée.
const GENERIC_BODY: &str = "Ouvre l'app pour voir 🌸";

/// Notifie (best-effort, en tâche de fond) les autres membres du space dont le
/// mode est 'push', via Web Push. Ne bloque jamais la requête appelante.
/// Les abonnements morts (404/410) sont purgés. `title` = type d'événement
/// (générique) ; le corps est invariant (cf. `GENERIC_BODY`).
pub fn notify_members(state: &AppState, space_id: Uuid, actor_id: Uuid, title: String) {
    let pool = state.pool.clone();
    let config = state.config.clone();

    tokio::spawn(async move {
        if config.vapid_private_key.is_empty() {
            tracing::debug!("VAPID non configuré : envoi push ignoré");
            return;
        }

        let subs: Vec<SubRow> = match sqlx::query_as(
            "SELECT ps.endpoint, ps.p256dh, ps.auth
             FROM push_subscriptions ps
             JOIN space_memberships m ON m.user_id = ps.user_id
             LEFT JOIN user_settings s ON s.user_id = ps.user_id
             WHERE m.space_id = $1 AND ps.user_id <> $2
               AND coalesce(s.notif_mode, 'ghost') = 'push'",
        )
        .bind(space_id)
        .bind(actor_id)
        .fetch_all(&pool)
        .await
        {
            Ok(s) => s,
            Err(e) => {
                tracing::error!(error = ?e, "lecture des abonnements push");
                return;
            }
        };
        if subs.is_empty() {
            return;
        }

        let payload = json!({ "title": title, "body": GENERIC_BODY }).to_string();
        let client = HyperWebPushClient::new();

        for sub in subs {
            let info = SubscriptionInfo::new(
                sub.endpoint.clone(),
                sub.p256dh.clone(),
                sub.auth.clone(),
            );

            let signature = match VapidSignatureBuilder::from_base64(
                &config.vapid_private_key,
                URL_SAFE_NO_PAD,
                &info,
            ) {
                Ok(mut builder) => {
                    builder.add_claim("sub", config.vapid_subject.clone());
                    match builder.build() {
                        Ok(sig) => sig,
                        Err(e) => {
                            tracing::error!(error = ?e, "signature VAPID");
                            continue;
                        }
                    }
                }
                Err(e) => {
                    tracing::error!(error = ?e, "builder VAPID");
                    continue;
                }
            };

            let mut message = WebPushMessageBuilder::new(&info);
            message.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
            message.set_vapid_signature(signature);
            let message = match message.build() {
                Ok(m) => m,
                Err(e) => {
                    tracing::error!(error = ?e, "construction du message push");
                    continue;
                }
            };

            match client.send(message).await {
                Ok(()) => {}
                Err(WebPushError::EndpointNotValid)
                | Err(WebPushError::EndpointNotFound) => {
                    let _ = sqlx::query(
                        "DELETE FROM push_subscriptions WHERE endpoint = $1",
                    )
                    .bind(&sub.endpoint)
                    .execute(&pool)
                    .await;
                }
                Err(e) => tracing::warn!(error = ?e, "envoi push échoué"),
            }
        }
    });
}
