use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

// ---------- Utilisateurs & espaces ----------

#[derive(Debug, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    /// Null pour les comptes OIDC uniquement.
    pub password_hash: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserPublic {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: Uuid,
    pub name: String,
    /// Fuseau IANA (ex: "Europe/Paris") — base du renouvellement du mood à minuit.
    pub timezone: String,
    /// Réactions prédéfinies actives, dans l'ordre d'affichage.
    pub reactions: Vec<String>,
    /// Autorise une réaction emoji libre (bouton « + »).
    pub allow_custom_reactions: bool,
    /// Vote d'humeur à l'aveugle : masque l'humeur du partenaire tant que je n'ai
    /// pas posé la mienne du jour (révélation mutuelle une fois les deux votes).
    pub blind_mood: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub id: Uuid,
    pub display_name: String,
    pub role: String,
}

// ---------- Mood ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Mood {
    pub user_id: Uuid,
    /// `None` = humeur masquée (vote à l'aveugle, avant que je vote) — API-08.
    pub status: Option<String>,
    pub updated_at: DateTime<Utc>,
}

// ---------- Posts ----------

/// Ligne brute d'un post (avant agrégation des interactions).
#[derive(Debug, sqlx::FromRow)]
pub struct PostRow {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub title: Option<String>,
    pub body: String,
    pub media_id: Option<Uuid>,
    /// Flag éphémère du média joint (null si aucun média).
    pub media_view_once: Option<bool>,
    /// Média éphémère déjà consommé (null si aucun média).
    pub media_consumed: Option<bool>,
    /// Type MIME du média joint (null si aucun) — distingue image / vidéo.
    pub media_mime: Option<String>,
    pub draft: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Post enrichi renvoyé au frontend (réactions, verdict, nb de commentaires).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub title: Option<String>,
    pub body: String,
    pub media_id: Option<Uuid>,
    /// Flag éphémère du média joint (null si aucun média).
    pub media_view_once: Option<bool>,
    /// Média éphémère déjà consommé (null si aucun média).
    pub media_consumed: Option<bool>,
    /// Type MIME du média joint (null si aucun) — distingue image / vidéo.
    pub media_mime: Option<String>,
    pub draft: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub reaction_counts: std::collections::HashMap<String, i64>,
    pub my_reactions: Vec<String>,
    pub verdict: Option<String>,
    pub comment_count: i64,
    /// Date du dernier commentaire posté par QUELQU'UN D'AUTRE (null si aucun) —
    /// sert au badge « nouveaux commentaires » du dashboard, comparé au last_seen.
    pub last_comment_at: Option<DateTime<Utc>>,
}

// ---------- Interactions ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionSummary {
    pub reaction_counts: std::collections::HashMap<String, i64>,
    pub my_reactions: Vec<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

// ---------- Challenges ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Challenge {
    pub id: Uuid,
    pub proposer_id: Uuid,
    pub title: String,
    pub description: String,
    pub intensity: String,
    pub status: String,
    pub deadline_label: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Proposition de défi. `space_id` null = globale (seed) ; sinon propre au salon.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeSuggestion {
    pub id: Uuid,
    pub space_id: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub intensity: String,
}

/// "Vu" d'un fil (blog/défis) par un membre — horodatage de dernière consultation.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SeenEntry {
    pub user_id: Uuid,
    pub feature: String,
    pub seen_at: DateTime<Utc>,
}

// ---------- Médias ----------

#[derive(Debug, sqlx::FromRow)]
pub struct Media {
    pub id: Uuid,
    pub storage_key: String,
    pub mime: String,
    pub view_once: bool,
    pub consumed: bool,
    /// Fichier chiffré au repos (AES-256-GCM) : nonce(12o) ++ ciphertext.
    pub encrypted: bool,
}

// ---------- Valeurs autorisées (contrat avec le frontend) ----------

pub const INTENSITIES: [&str; 2] = ["soft", "hot"];
pub const MOODS: [&str; 5] = ["calm", "flirty", "veryHot", "tired", "cuddleNeeded"];
pub const REACTIONS: [&str; 5] = ["heart", "fire", "smirk", "breath", "hush"];
pub const VERDICTS: [&str; 3] = ["hot", "curious", "notForMe"];

/// Transitions valides de la machine à états des défis.
pub fn challenge_transition_allowed(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("proposed", "challengeAccepted")
            | ("proposed", "maybeMaybe")
            | ("maybeMaybe", "challengeAccepted")
            | ("challengeAccepted", "jobDone")
    )
}

/// Une transition « réponse à une proposition » (accepter le défi ou demander à
/// l'adapter) est la prérogative du DESTINATAIRE : le proposeur ne peut pas
/// l'effectuer lui-même (SEC-015). La validation finale (`jobDone`) en est exclue.
pub fn is_proposal_response(to: &str) -> bool {
    matches!(to, "challengeAccepted" | "maybeMaybe")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transitions_autorisees() {
        assert!(challenge_transition_allowed("proposed", "challengeAccepted"));
        assert!(challenge_transition_allowed("proposed", "maybeMaybe"));
        assert!(challenge_transition_allowed("maybeMaybe", "challengeAccepted"));
        assert!(challenge_transition_allowed("challengeAccepted", "jobDone"));
    }

    #[test]
    fn reponses_a_une_proposition() {
        // Réservées au destinataire (le proposeur ne peut pas les faire).
        assert!(is_proposal_response("challengeAccepted"));
        assert!(is_proposal_response("maybeMaybe"));
        // La validation finale et un état inconnu n'en sont pas.
        assert!(!is_proposal_response("jobDone"));
        assert!(!is_proposal_response("proposed"));
    }

    #[test]
    fn transitions_refusees() {
        // Raccourci interdit, retour en arrière, no-op, état inconnu.
        assert!(!challenge_transition_allowed("proposed", "jobDone"));
        assert!(!challenge_transition_allowed("maybeMaybe", "jobDone"));
        assert!(!challenge_transition_allowed("jobDone", "proposed"));
        assert!(!challenge_transition_allowed("challengeAccepted", "maybeMaybe"));
        assert!(!challenge_transition_allowed("proposed", "proposed"));
        assert!(!challenge_transition_allowed("inconnu", "jobDone"));
    }
}
