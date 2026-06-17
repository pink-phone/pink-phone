// Les moods possibles (la "météo sexuelle"). L'enum miroir côté backend Rust :
// MoodStatus { Calm, Flirty, VeryHot, Tired, CuddleNeeded, Neutral }
export type MoodId =
  | "calm"
  | "flirty"
  | "veryHot"
  | "tired"
  | "cuddleNeeded";

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
