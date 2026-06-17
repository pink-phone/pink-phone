// Données de démonstration partagées par les stories et l'App.
// Aucune dépendance réseau garantie : les médias pointent vers des photos neutres.
import type { BlogPostMedia } from "../components/BlogPost/BlogPost";
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

export const ME: Person = { name: "You", glyph: "Y" };
export const PARTNER: Person = { name: "Camille", glyph: "C" };
export const SPACE_NAME = "Pink Phone";

export interface MoodSnapshot {
  mood: MoodId;
  timeLabel: string;
}

export const PARTNER_MOOD: MoodSnapshot = {
  mood: "cuddleNeeded",
  timeLabel: "10 min ago",
};

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
  /** Le post appartient à l'utilisateur courant (active suppression/publication). */
  isMine?: boolean;
  /** Mon post a été vu par le/la partenaire (accusé de lecture). */
  seenByPartner?: boolean;
}

export const SAMPLE_POSTS: PostData[] = [
  {
    id: "p0",
    author: ME,
    timeLabel: "Just now",
    title: "A note for later…",
    body: "An idea I'm keeping warm — I'll polish it before sending it your way.",
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
    timeLabel: "Yesterday, 11pm",
    title: "This idea on my mind…",
    body:
      "I was thinking about what we whispered the other night. I'd love to take our time, no rush, just to explore.",
    reactionCounts: { fire: 2, smirk: 1 },
    myReactions: ["fire"],
    verdict: "curious",
    commentCount: 3,
  },
  {
    id: "p2",
    author: ME,
    timeLabel: "Tuesday, 8am",
    body:
      "Quick recap of last night: it was perfect. I loved how slow it was. Let's do it again whenever you want. 😏",
    reactionCounts: { fire: 1, smirk: 2, breath: 1 },
    myReactions: [],
    verdict: "hot",
    commentCount: 1,
    isMine: true,
  },
  {
    id: "p3",
    author: PARTNER,
    timeLabel: "Sunday",
    body: "Just for you, and just for tonight. Look quickly. 🤫",
    media: { src: DEMO_PHOTO, alt: "Ephemeral photo", viewOnce: true },
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
    title: "An oil massage, no phones",
    description:
      "An hour just for you, soft light. You just let go, that's all.",
    intensity: "hot",
    status: "proposed",
    deadlineLabel: "Before Sunday",
    perspective: "recipient",
  },
  {
    id: "c2",
    title: "The forbidden word",
    description:
      "We send a single text during the day. As suggestive as possible, without anything explicit.",
    intensity: "soft",
    status: "challengeAccepted",
    perspective: "proposer",
  },
  {
    id: "c3",
    title: "Blindfolded evening",
    description: "Blindfold on, you let yourself be guided all evening.",
    intensity: "hot",
    status: "maybeMaybe",
    perspective: "recipient",
  },
  {
    id: "c4",
    title: "The romantic date",
    description: "Like the first night: we rediscover each other, no rush.",
    intensity: "soft",
    status: "jobDone",
    perspective: "proposer",
  },
];
