// Machine à états des défis. Miroir de l'enum Rust ChallengeStatus.
export type ChallengeStatus =
  | "proposed"
  | "challengeAccepted"
  | "maybeMaybe"
  | "jobDone";

export type Intensity = "soft" | "hot" | "hard";

export const INTENSITY_LABEL: Record<Intensity, string> = {
  soft: "Soft",
  hot: "Hot",
  hard: "Hard",
};

interface StatusMeta {
  label: string;
  hint: string;
}

export const STATUS_META: Record<ChallengeStatus, StatusMeta> = {
  proposed: { label: "Proposé", hint: "En attente de réponse…" },
  challengeAccepted: { label: "En cours", hint: "Challenge accepted ✨" },
  maybeMaybe: { label: "À adapter", hint: "Maybe, maybe… on en reparle" },
  jobDone: { label: "Terminé", hint: "Job done — validé à deux 🎉" },
};

export interface ChallengePreset {
  title: string;
  description: string;
  intensity: Intensity;
}

// La "banque" de défis pré-écrits, pour démarrer sans page blanche.
export const CHALLENGE_PRESETS: ChallengePreset[] = [
  {
    title: "Le mot interdit",
    description:
      "Un seul SMS aujourd'hui, le plus suggestif possible — sans rien dire d'explicite.",
    intensity: "soft",
  },
  {
    title: "Massage aux huiles",
    description: "Une heure rien que pour l'autre, lumière tamisée, sans téléphone.",
    intensity: "hot",
  },
  {
    title: "Soirée à l'aveugle",
    description: "Bandeau sur les yeux, tu te laisses guider toute la soirée.",
    intensity: "hard",
  },
];
