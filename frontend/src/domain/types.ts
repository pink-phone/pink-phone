// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
// Source de vérité : les constantes de `backend/src/models.rs`,
// régénéré par le test `domain_codegen` (`cargo test`) — API-13.
//
// Caveat : moods et réactions voyagent en `string` à la frontière (une
// valeur prédéfinie OU un emoji/libellé libre). Ces unions décrivent
// l'ensemble *connu*, validé côté serveur, pas un enum fermé.

export type ChallengeStatus = "proposed" | "challengeAccepted" | "maybeMaybe" | "jobDone";
export type Intensity = "soft" | "hot";
export type Verdict = "hot" | "curious" | "notForMe";
export type ReactionId = "heart" | "fire" | "smirk" | "breath" | "hush";
export type MoodId = "calm" | "flirty" | "veryHot" | "tired" | "cuddleNeeded";
