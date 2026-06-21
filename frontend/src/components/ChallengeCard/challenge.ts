// Types de domaine (machine à états + intensité) : définis dans `domain/types`
// (couche neutre, miroir Rust), re-exportés ici par commodité pour les
// composants/écrans qui les consomment déjà via ce chemin.
import type { ChallengeStatus, Intensity } from "../../domain/types";
export type { ChallengeStatus, Intensity };

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
    intensity: "hot",
  },
];
