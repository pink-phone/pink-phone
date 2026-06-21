// Les moods possibles (la "météo sexuelle"). `MoodId` est un type de domaine
// (miroir Rust `MoodStatus`), défini dans `domain/types` et re-exporté ici.
import type { MoodId } from "../../domain/types";
export type { MoodId };

export interface MoodOption {
  id: MoodId;
  emoji: string;
  label: string;
}

export const MOODS: MoodOption[] = [
  { id: "calm", emoji: "🌙", label: "Calme" },
  { id: "flirty", emoji: "😏", label: "Taquin·e" },
  { id: "veryHot", emoji: "🔥", label: "Très chaud·e" },
  { id: "tired", emoji: "🥱", label: "Fatigué·e" },
  { id: "cuddleNeeded", emoji: "🫶", label: "Besoin de tendresse" },
];
