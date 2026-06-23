// Vue-modèles partagés entre la couche orchestration (`app/`), les écrans
// (`screens/`) et les fixtures de stories (`mock/`). C'est le contrat de
// présentation : `SpaceApp` mappe les réponses de l'API (`api/types`) vers ces
// formes, les écrans les reçoivent en props. La dépendance va production →
// contrat ; les données mock dépendent de ce module (pas l'inverse).
import type { BlogPostMedia } from "../components/BlogPost/BlogPost";
import type { ChallengeStatus, Intensity, Verdict } from "../domain/types";

export interface Person {
  name: string;
  glyph: string;
}

export interface MoodSnapshot {
  /** Id de mood prédéfini OU emoji libre (mood custom). */
  mood: string;
  timeLabel: string;
}

export interface PostData {
  id: string;
  author: Person;
  timeLabel: string;
  title?: string;
  body: string;
  media?: BlogPostMedia;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  verdict: Verdict | null;
  commentCount: number;
  /** Brouillon (visible du seul auteur). */
  draft?: boolean;
  /** Le post a été édité après publication (updatedAt > createdAt) — API-10. */
  edited?: boolean;
  /** Le post appartient à l'utilisateur courant (active suppression/publication). */
  isMine?: boolean;
  /** Membres ayant vu mon post (accusé de lecture nominatif). Mes posts seulement. */
  seenBy?: { name: string; timeLabel: string }[];
}

export interface ChallengeData {
  id: string;
  title: string;
  description: string;
  intensity: Intensity;
  status: ChallengeStatus;
  deadlineLabel?: string;
  perspective?: "recipient" | "proposer";
}
