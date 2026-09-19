use std::net::{IpAddr, Ipv4Addr};

use serde_json::json;
use uuid::Uuid;
use web_push::{
    ContentEncoding, SubscriptionInfo, VapidSignatureBuilder, WebPushClient,
    WebPushError, WebPushMessageBuilder,
};

use crate::state::AppState;

#[derive(sqlx::FromRow)]
struct SubRow {
    endpoint: String,
    p256dh: String,
    auth: String,
}

/// `true` si `ip` désigne une adresse interne/privée/réservée qu'un endpoint de
/// notification push n'a aucune raison légitime de cibler (SECURITY_FINDINGS.md
/// #11, SSRF) : un vrai service de push (FCM, Mozilla, Apple, Windows…) répond
/// toujours depuis une IP publique.
fn is_disallowed_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_disallowed_ipv4(v4),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            // Une IPv4 privée déguisée en IPv6 mappée (::ffff:10.0.0.1) reste
            // une IPv4 privée : on ré-applique le même contrôle.
            Some(mapped) => is_disallowed_ipv4(mapped),
            None => {
                v6.is_loopback()
                    || v6.is_unspecified()
                    || v6.is_multicast()
                    // Unique local fc00::/7 (équivalent IPv6 des plages privées).
                    || (v6.segments()[0] & 0xfe00) == 0xfc00
                    // Link-local fe80::/10.
                    || (v6.segments()[0] & 0xffc0) == 0xfe80
            }
        },
    }
}

fn is_disallowed_ipv4(v4: Ipv4Addr) -> bool {
    v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_unspecified()
        || v4.is_multicast()
        || v4.is_broadcast()
        || v4.is_documentation()
}

/// Un endpoint de notification push est-il sûr à appeler (SECURITY_FINDINGS.md
/// #11) ? `subscribe()` (routes/notifications.rs) n'imposait AUCUNE contrainte
/// sur `endpoint` avant de le stocker, alors qu'il finit tel quel comme cible
/// d'une requête HTTP sortante ici — n'importe quel utilisateur authentifié
/// pouvait ainsi faire du serveur un relais SSRF (réseau interne, service
/// cloud de métadonnées…), sans même dépendre d'une action d'un·e partenaire :
/// deux comptes à soi dans le même salon suffisent à se déclencher la notif.
/// On exige `https://` (les vrais services de push n'utilisent que ça) et on
/// résout le host pour rejeter toute IP privée/loopback/link-local/réservée —
/// y compris pour un nom de domaine, en vérifiant TOUTES les IP résolues.
/// Ré-appelée à l'ENVOI (pas seulement à l'abonnement) pour réduire la fenêtre
/// d'un DNS rebinding (résidu connu : rien n'empêche un changement de DNS
/// pile entre cette résolution et la connexion HTTP elle-même côté `web-push`).
pub(crate) async fn endpoint_is_safe(endpoint: &str) -> bool {
    let Ok(url) = url::Url::parse(endpoint) else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str().map(str::to_string) else {
        return false;
    };
    let port = url.port_or_known_default().unwrap_or(443);
    if let Ok(ip) = host.parse::<IpAddr>() {
        return !is_disallowed_ip(ip);
    }
    let resolved = tokio::net::lookup_host((host.as_str(), port)).await;
    let safe = match resolved {
        Ok(addrs) => {
            let addrs: Vec<_> = addrs.collect();
            !addrs.is_empty() && addrs.iter().all(|a| !is_disallowed_ip(a.ip()))
        }
        Err(_) => false,
    };
    safe
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
    let push_client = state.push_client.clone();

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
        let client = push_client;

        for sub in subs {
            // Revalidation à l'envoi (SECURITY_FINDINGS.md #11) : réduit la
            // fenêtre d'un DNS rebinding par rapport à une validation faite une
            // fois pour toutes à l'abonnement.
            if !endpoint_is_safe(&sub.endpoint).await {
                tracing::warn!(
                    target: "notifications",
                    "endpoint de notification refusé à l'envoi (SSRF) — purgé"
                );
                let _ = sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = $1")
                    .bind(&sub.endpoint)
                    .execute(&pool)
                    .await;
                continue;
            }
            let info = SubscriptionInfo::new(
                sub.endpoint.clone(),
                sub.p256dh.clone(),
                sub.auth.clone(),
            );

            // web-push 0.11 : la clé est toujours du base64 URL-safe sans padding.
            let signature = match VapidSignatureBuilder::from_base64(
                &config.vapid_private_key,
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
                Err(WebPushError::EndpointNotValid(_))
                | Err(WebPushError::EndpointNotFound(_)) => {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipv4_privees_et_reservees_refusees() {
        assert!(is_disallowed_ip("127.0.0.1".parse().unwrap()));
        assert!(is_disallowed_ip("10.0.0.5".parse().unwrap()));
        assert!(is_disallowed_ip("172.16.0.1".parse().unwrap()));
        assert!(is_disallowed_ip("192.168.1.1".parse().unwrap()));
        assert!(is_disallowed_ip("169.254.169.254".parse().unwrap())); // métadonnées cloud
        assert!(is_disallowed_ip("0.0.0.0".parse().unwrap()));
    }

    #[test]
    fn ipv4_publique_autorisee() {
        assert!(!is_disallowed_ip("8.8.8.8".parse().unwrap()));
        assert!(!is_disallowed_ip("142.250.190.4".parse().unwrap()));
    }

    #[test]
    fn ipv6_privees_refusees() {
        assert!(is_disallowed_ip("::1".parse().unwrap())); // loopback
        assert!(is_disallowed_ip("fc00::1".parse().unwrap())); // unique local
        assert!(is_disallowed_ip("fe80::1".parse().unwrap())); // link-local
    }

    #[test]
    fn signature_vapid_et_message_chiffre_se_construisent() {
        // Couvre la chaîne web-push sans réseau : clé VAPID base64url (sans
        // padding), signature ES256, puis chiffrement aes128gcm du payload
        // pour une souscription (clés d'exemple de la doc web-push).
        let info = SubscriptionInfo::new(
            "https://push.example.com/send/abc",
            "BLMbF9ffKBiWQLCKvTHb6LO8Nb6dcUh6TItC455vu2kElga6PQvUmaFyCdykxY2nOSSL3yKgfbmFLRTUaGv4yV8",
            "xS03Fi5ErfTNH_l9WHE9Ig",
        );
        let mut builder = VapidSignatureBuilder::from_base64(
            "IQ9Ur0ykXoHS9gzfYX0aBjy9lvdrjx_PFUXmie9YRcY",
            &info,
        )
        .expect("clé VAPID base64url valide");
        builder.add_claim("sub", "mailto:test@example.com");
        let signature = builder.build().expect("signature VAPID");

        let mut message = WebPushMessageBuilder::new(&info);
        message.set_payload(ContentEncoding::Aes128Gcm, b"{\"title\":\"test\"}");
        message.set_vapid_signature(signature);
        message.build().expect("message push chiffré");
    }

    #[test]
    fn cle_vapid_invalide_refusee() {
        let info = SubscriptionInfo::new("https://push.example.com/x", "AAAA", "AAAA");
        assert!(VapidSignatureBuilder::from_base64("pas-une-cle", &info).is_err());
    }

    #[test]
    fn ipv4_privee_deguisee_en_ipv6_mappee_refusee() {
        // ::ffff:10.0.0.1 est une IPv4 privée déguisée : doit être refusée.
        assert!(is_disallowed_ip("::ffff:10.0.0.1".parse().unwrap()));
        assert!(!is_disallowed_ip("::ffff:8.8.8.8".parse().unwrap()));
    }

    #[tokio::test]
    async fn endpoint_https_requis() {
        assert!(!endpoint_is_safe("http://fcm.googleapis.com/fcm/send/abc").await);
    }

    #[tokio::test]
    async fn endpoint_ip_litterale_privee_refusee() {
        assert!(!endpoint_is_safe("https://127.0.0.1/steal").await);
        assert!(!endpoint_is_safe("https://169.254.169.254/latest/meta-data/").await);
        assert!(!endpoint_is_safe("https://192.168.1.1:8080/").await);
    }

    #[tokio::test]
    async fn endpoint_url_invalide_refusee() {
        assert!(!endpoint_is_safe("pas-une-url").await);
        assert!(!endpoint_is_safe("").await);
    }
}
