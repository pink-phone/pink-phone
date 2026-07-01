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
    /// Défaut du salon pour « média téléchargeable » des nouveaux posts (#78).
    pub allow_media_download: bool,
    /// Liste d'envies à double consentement (#99) activée pour ce salon.
    pub desires_enabled: bool,
    /// Registre des libellés de la bucket list : explicite (défaut) vs suggestif.
    pub desires_explicit_labels: bool,
    /// « Menu du soir » : rituel quotidien à double consentement (#97b).
    pub evening_menu_enabled: bool,
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

/// Ligne brute d'un post (avant agrégation des interactions + médias).
#[derive(Debug, sqlx::FromRow)]
pub struct PostRow {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub title: Option<String>,
    pub body: String,
    pub draft: bool,
    /// Les médias joints sont téléchargeables (#78). Flag au niveau du POST.
    pub allow_download: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Un média d'une galerie de post (#87), ordonné par `position` côté requête.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PostMediaItem {
    pub id: Uuid,
    /// Type MIME (distingue image / vidéo).
    pub mime: String,
    /// Éphémère (« view once ») — propre au média.
    pub view_once: bool,
    /// Média éphémère déjà consommé.
    pub consumed: bool,
}

/// Ligne de la requête groupée `post_media JOIN media` (porte le `post_id`).
#[derive(Debug, sqlx::FromRow)]
pub struct PostMediaRow {
    pub post_id: Uuid,
    pub id: Uuid,
    pub mime: String,
    pub view_once: bool,
    pub consumed: bool,
}

/// Post enrichi renvoyé au frontend (médias, réactions, verdict, nb de commentaires).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub title: Option<String>,
    pub body: String,
    /// Galerie de médias, ordonnée (#87). Vide si le post n'a pas de média.
    pub media: Vec<PostMediaItem>,
    pub draft: bool,
    /// Les médias joints sont téléchargeables (#78). Flag au niveau du POST.
    pub allow_download: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub reaction_counts: std::collections::HashMap<String, i64>,
    pub my_reactions: Vec<String>,
    pub verdict: Option<String>,
    /// Le post est dans MES favoris (marque-page personnel, #96).
    pub is_favorite: bool,
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

/// Notice de salon affichée sur le dashboard (#84/#85) : qui a fait quoi, quand.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: Uuid,
    /// 'member_joined' | 'download_enabled'.
    pub kind: String,
    pub actor_id: Option<Uuid>,
    /// Nom de l'auteur (null si système / compte supprimé).
    pub actor_name: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    /// Dernière édition (= created_at si jamais édité) — RR-04.
    pub updated_at: DateTime<Utc>,
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
    /// Langue de l'idée (« fr »/« en ») — renvoyée à la création (API-16).
    pub locale: String,
    /// Un défi issu de cette suggestion a déjà été réalisé dans le salon (#69).
    /// Calculé seulement au listing → défaut `false` ailleurs (create/update).
    #[sqlx(default)]
    pub done: bool,
    /// Suggestion masquée par le salon (#70). Idem : calculé au listing.
    #[sqlx(default)]
    pub hidden: bool,
}

/// Une envie du catalogue (#99) telle que renvoyée au membre courant : son code
/// stable + MON intérêt + l'état « matché ». L'intérêt brut des AUTRES n'est jamais
/// exposé (double-aveugle) : `matched` n'est vrai que si moi ET un autre membre
/// avons coché ce code.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesireItem {
    pub code: String,
    /// Catégorie du catalogue (#99 bucket list) — pour le regroupement à l'écran.
    pub category: String,
    /// J'ai marqué « envie » (privé, révélé seulement en cas de match).
    pub interested: bool,
    /// J'ai marqué « contre » (limite). Mon état, toujours visible de moi.
    pub against: bool,
    /// Réciprocité d'envie (les deux « envie ») → révélé.
    pub matched: bool,
    /// Au moins un membre est « contre » → limite affichée au couple (bloque le
    /// match). Surfacé (≠ l'envie double-aveugle) : une limite se respecte.
    pub limit: bool,
    /// Le couple a coché « ✓ Réalisé » (suivi bucket list, niveau salon).
    pub done: bool,
}

/// Un « mot doux » (#102) tel que renvoyé au membre courant. Si `open_at` est dans
/// le futur ET que je ne suis pas l'auteur·e, le mot est **scellé** : `body` est
/// `None` et `sealed` vrai (je vois qu'une surprise m'attend + sa date, pas son
/// contenu). L'auteur·e voit toujours le sien.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoveNote {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    /// `None` quand le mot est scellé pour moi (ouverture différée non échue).
    pub body: Option<String>,
    pub sealed: bool,
    pub open_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Un item du « Menu du soir » (#97b) pour ce soir, côté membre courant : mon
/// choix du jour + l'état « matché » (les deux l'ont coché aujourd'hui). Même
/// double-aveugle que `DesireItem` : `matched` n'est vrai qu'en cas de réciprocité.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EveningMenuItem {
    pub code: String,
    pub picked: bool,
    pub matched: bool,
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
/// Catalogue curaté des « envies » (#99, bucket list), groupé par CATÉGORIE et
/// dans l'ordre d'affichage. Codes stables (insensibles à la langue) ; les libellés
/// (items ET catégories) vivent dans l'i18n du frontend. Source de vérité du
/// catalogue ET de la validation. Ajouter une envie = l'ajouter ici + sa clé i18n
/// FR/EN. Chaque entrée = (catégorie, [codes]).
pub const DESIRE_CATEGORIES: &[(&str, &[&str])] = &[
    (
        "tender",
        &[
            "morningCuddle",
            "oilMassage",
            "bathTogether",
            "slowDance",
            "lingerie",
            "rediscover",
        ],
    ),
    (
        "games",
        &[
            "roleplay",
            "truthOrDare",
            "striptease",
            "photoSession",
            "writeFantasy",
            "daySexting",
        ],
    ),
    (
        "positions",
        &[
            "missionary",
            "doggy",
            "cowgirl",
            "reverseCowgirl",
            "spooning",
            "lotus",
            "wheelbarrow",
            "standing",
            "edgeOfBed",
            "mirror",
            "newPositionMonthly",
        ],
    ),
    (
        "sensations",
        &[
            "blindfold",
            "lightBondage",
            "spanking",
            "temperature",
            "edging",
            "toy",
        ],
    ),
    (
        "power",
        &[
            "gentleDomination",
            "submission",
            "commands",
            "softCollar",
            "eveningRules",
        ],
    ),
    (
        "places",
        &["outdoors", "car", "hotel", "anotherRoom", "semiPublic", "voyeur"],
    ),
    (
        // Catégorie « hot » : les actes eux-mêmes (#99, registre assumé).
        "practices",
        &[
            "fellatio",
            "cunnilingus",
            "sixtyNine",
            "mutualMasturbation",
            "fingering",
            "rimming",
            "anal",
            "facial",
            "swallow",
            "squirting",
        ],
    ),
];

/// Catégorie d'un code du catalogue d'envies (#99), ou `None` si inconnu (sert à
/// la validation des coches/réalisations).
pub fn desire_category(code: &str) -> Option<&'static str> {
    DESIRE_CATEGORIES
        .iter()
        .find(|(_, codes)| codes.contains(&code))
        .map(|(cat, _)| *cat)
}
/// Catalogue du « Menu du soir » (#97b), du plus tendre au plus épicé. Codes
/// stables (libellés via i18n front) ; source de vérité du menu + validation des
/// coches. Distinct de `DESIRE_CODES` (registre « programme de la soirée »).
pub const EVENING_MENU_CODES: [&str; 10] = [
    "cuddle",
    "movie",
    "candlelight",
    "bath",
    "massage",
    "slowDance",
    "game",
    "roleplay",
    "newThing",
    "passionate",
];
/// États de la machine à états des défis, dans l'ordre d'affichage. Source de
/// vérité du type TS `ChallengeStatus` (généré — API-13) ; seul le codegen le
/// consomme aujourd'hui côté Rust (la machine à états vit dans les `match`).
#[cfg_attr(not(test), allow(dead_code))]
pub const CHALLENGE_STATUSES: [&str; 4] =
    ["proposed", "challengeAccepted", "maybeMaybe", "jobDone"];

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

/// Génération du module de types de domaine TypeScript depuis les constantes Rust
/// (source de vérité unique — API-13). Le test `types_ts_a_jour` régénère
/// `frontend/src/domain/types.ts` et échoue s'il était périmé : un statut/mood/
/// réaction ne se modifie qu'ICI, plus de miroir Rust↔TS à maintenir à la main.
#[cfg(test)]
mod domain_codegen {
    use super::*;

    fn ts_union(values: &[&str]) -> String {
        values
            .iter()
            .map(|v| format!("\"{v}\""))
            .collect::<Vec<_>>()
            .join(" | ")
    }

    /// Contenu attendu de `frontend/src/domain/types.ts`.
    fn render() -> String {
        format!(
            "// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.\n\
             // Source de vérité : les constantes de `backend/src/models.rs`,\n\
             // régénéré par le test `domain_codegen` (`cargo test`) — API-13.\n\
             //\n\
             // Caveat : moods et réactions voyagent en `string` à la frontière (une\n\
             // valeur prédéfinie OU un emoji/libellé libre). Ces unions décrivent\n\
             // l'ensemble *connu*, validé côté serveur, pas un enum fermé.\n\
             \n\
             export type ChallengeStatus = {challenge};\n\
             export type Intensity = {intensity};\n\
             export type Verdict = {verdict};\n\
             export type ReactionId = {reaction};\n\
             export type MoodId = {mood};\n",
            challenge = ts_union(&CHALLENGE_STATUSES),
            intensity = ts_union(&INTENSITIES),
            verdict = ts_union(&VERDICTS),
            reaction = ts_union(&REACTIONS),
            mood = ts_union(&MOODS),
        )
    }

    #[test]
    fn types_ts_a_jour() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../frontend/src/domain/types.ts");
        // Build backend-only (hors monorepo) : le front n'est pas là → on saute.
        if !path.parent().is_some_and(|p| p.exists()) {
            return;
        }
        let expected = render();
        let current = std::fs::read_to_string(&path).unwrap_or_default();
        if current != expected {
            std::fs::write(&path, &expected).expect("écriture de types.ts");
            panic!(
                "frontend/src/domain/types.ts était périmé → régénéré (API-13). \
                 Relance `cargo test` et recommit le fichier."
            );
        }
    }
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
