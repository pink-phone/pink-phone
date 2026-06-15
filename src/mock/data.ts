// Données de démonstration partagées par les stories et l'App.
// Aucune dépendance réseau garantie : les médias pointent vers des photos neutres.
import type { BlogPostMedia } from "../components/BlogPost/BlogPost";
import type { ReactionId } from "../components/ReactionBar/ReactionBar";
import type { Verdict } from "../components/VerdictPicker/VerdictPicker";
import type { MoodId } from "../components/MoodSelector/moods";
import type {
  ChallengeStatus,
  Intensity,
} from "../components/ChallengeCard/challenge";

const DEMO_PHOTO =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";

export interface Person {
  name: string;
  glyph: string;
}

export const ME: Person = { name: "Toi", glyph: "T" };
export const PARTNER: Person = { name: "Camille", glyph: "C" };
export const SPACE_NAME = "Pink Phone";

export interface MoodSnapshot {
  mood: MoodId;
  timeLabel: string;
}

export const PARTNER_MOOD: MoodSnapshot = {
  mood: "cuddleNeeded",
  timeLabel: "il y a 10 min",
};

export interface PostData {
  id: string;
  author: Person;
  timeLabel: string;
  title?: string;
  body: string;
  media?: BlogPostMedia;
  reactionCounts: Partial<Record<ReactionId, number>>;
  myReactions: ReactionId[];
  verdict: Verdict | null;
  commentCount: number;
  /** Brouillon (visible du seul auteur). */
  draft?: boolean;
  /** Le post appartient à l'utilisateur courant (active suppression/publication). */
  isMine?: boolean;
}

export const SAMPLE_POSTS: PostData[] = [
  {
    id: "p0",
    author: ME,
    timeLabel: "À l'instant",
    title: "Note pour plus tard…",
    body: "Une idée que je garde au chaud, je la peaufine avant de te l'envoyer.",
    reactionCounts: {},
    myReactions: [],
    verdict: null,
    commentCount: 0,
    draft: true,
    isMine: true,
  },
  {
    id: "p1",
    author: PARTNER,
    timeLabel: "Hier, 23 h",
    title: "Cette idée qui me trotte…",
    body:
      "Je repensais à ce qu'on s'est murmuré l'autre soir. J'aimerais qu'on prenne le temps, sans précipitation, juste pour explorer.",
    reactionCounts: { fire: 2, smirk: 1 },
    myReactions: ["fire"],
    verdict: "curious",
    commentCount: 3,
  },
  {
    id: "p2",
    author: ME,
    timeLabel: "Mardi, 8 h",
    body:
      "Petit débrief d'hier soir : c'était parfait. J'ai adoré la lenteur. On recommence quand tu veux. 😏",
    reactionCounts: { fire: 1, smirk: 2, breath: 1 },
    myReactions: [],
    verdict: "hot",
    commentCount: 1,
    isMine: true,
  },
  {
    id: "p3",
    author: PARTNER,
    timeLabel: "Dimanche",
    body: "Juste pour toi, et juste pour ce soir. Regarde vite. 🤫",
    media: { src: DEMO_PHOTO, alt: "Photo éphémère", viewOnce: true },
    reactionCounts: { hush: 1 },
    myReactions: [],
    verdict: null,
    commentCount: 0,
  },
];

export interface ChallengeData {
  id: string;
  title: string;
  description: string;
  intensity: Intensity;
  status: ChallengeStatus;
  deadlineLabel?: string;
  perspective?: "recipient" | "proposer";
}

export const SAMPLE_CHALLENGES: ChallengeData[] = [
  {
    id: "c1",
    title: "Un massage aux huiles, sans téléphone",
    description:
      "Une heure rien que pour toi, lumière tamisée. Tu te laisses faire, c'est tout.",
    intensity: "hot",
    status: "proposed",
    deadlineLabel: "Avant dimanche",
    perspective: "recipient",
  },
  {
    id: "c2",
    title: "Le mot interdit",
    description:
      "On s'envoie un seul SMS dans la journée. Le plus suggestif possible, mais sans rien dire d'explicite.",
    intensity: "soft",
    status: "challengeAccepted",
    perspective: "proposer",
  },
  {
    id: "c3",
    title: "Soirée à l'aveugle",
    description: "Bandeau sur les yeux, tu te laisses guider toute la soirée.",
    intensity: "hard",
    status: "maybeMaybe",
    perspective: "recipient",
  },
  {
    id: "c4",
    title: "Le rendez-vous galant",
    description: "Comme au premier soir : on se redécouvre, sans précipitation.",
    intensity: "soft",
    status: "jobDone",
    perspective: "proposer",
  },
];
