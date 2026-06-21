// Types de domaine partagés, miroirs des enums Rust du backend. Couche neutre :
// la présentation (`components/`) ET l'infra réseau (`api/`) en dépendent, sans
// se référencer l'une l'autre (la flèche pointe toujours vers le domaine).
//
// Caveat : moods et réactions voyagent en `string` à la frontière (une valeur
// prédéfinie OU un emoji/libellé libre). Ces unions décrivent l'ensemble *connu*,
// validé côté serveur ("prédéfini OU emoji/libellé borné"), pas un enum fermé.

// Machine à états des défis. Miroir de l'enum Rust `ChallengeStatus`.
export type ChallengeStatus =
  | "proposed"
  | "challengeAccepted"
  | "maybeMaybe"
  | "jobDone";

export type Intensity = "soft" | "hot";

// Verdict d'un post (persisté côté backend, non câblé dans l'UI). Miroir Rust.
export type Verdict = "hot" | "curious" | "notForMe";

// Réactions prédéfinies (ensemble connu ; des emojis libres sont aussi permis).
export type ReactionId = "heart" | "fire" | "smirk" | "breath" | "hush";

// Moods prédéfinis (la « météo sexuelle »). Miroir Rust `MoodStatus`.
export type MoodId = "calm" | "flirty" | "veryHot" | "tired" | "cuddleNeeded";
