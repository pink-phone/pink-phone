// Types des réponses de l'API Rust. Les chaînes (status/mood/intensity) sont
// alignées 1:1 sur les types de domaine (miroir des enums Rust), couche neutre
// dont dépendent aussi bien l'infra réseau que la présentation.
import type {
  ChallengeStatus,
  Intensity,
  ReactionId,
  Verdict,
} from "../domain/types";

/**
 * Page renvoyée par les listes paginées (curseur `before`, RUST-12/API-11) :
 * les éléments + s'il en reste de plus anciens à charger.
 */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

export interface UserPublic {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface Space {
  id: string;
  name: string;
  /** Fuseau IANA du salon (renouvellement du mood à minuit). Défaut serveur: Europe/Paris. */
  timezone: string;
  /** Réactions prédéfinies actives, dans l'ordre d'affichage (ensemble connu). */
  reactions: ReactionId[];
  /** Autorise une réaction emoji libre. */
  allowCustomReactions: boolean;
  /** Vote d'humeur à l'aveugle : masque l'humeur du partenaire tant que je n'ai pas voté. */
  blindMood: boolean;
  createdAt: string;
}

export interface Member {
  id: string;
  displayName: string;
  role: string;
}

export interface MoodEntry {
  userId: string;
  /**
   * Id de mood prédéfini OU emoji libre (mood custom). `null` = humeur masquée
   * (vote à l'aveugle, avant que j'aie posé la mienne — API-08).
   */
  status: string | null;
  updatedAt: string;
}

export interface ApiPost {
  id: string;
  authorId: string;
  authorName: string;
  title: string | null;
  body: string;
  mediaId: string | null;
  /** Flag éphémère du média joint (null si aucun média). */
  mediaViewOnce: boolean | null;
  /** Média éphémère déjà consommé (null si aucun média). */
  mediaConsumed: boolean | null;
  /** Type MIME du média joint (null si aucun) — distingue image / vidéo. */
  mediaMime: string | null;
  /** Brouillon : visible du seul auteur, non notifié tant qu'il n'est pas publié. */
  draft: boolean;
  createdAt: string;
  /** Dernière modification de contenu (= createdAt si jamais édité) — API-10. */
  updatedAt: string;
  // Clés = id de réaction prédéfinie OU emoji libre (réaction custom).
  reactionCounts: Record<string, number>;
  myReactions: string[];
  verdict: Verdict | null;
  commentCount: number;
  /** Date du dernier commentaire posté par quelqu'un d'autre (null si aucun). */
  lastCommentAt: string | null;
}

export interface ReactionSummary {
  reactionCounts: Record<string, number>;
  myReactions: string[];
}

export interface ApiComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ApiChallenge {
  id: string;
  proposerId: string;
  title: string;
  description: string;
  intensity: Intensity;
  status: ChallengeStatus;
  deadlineLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeenEntry {
  userId: string;
  feature: string; // 'blog' | 'challenges'
  seenAt: string;
}

export interface ChallengeSuggestion {
  id: string;
  /** null = suggestion globale (seed, non éditable) ; sinon propre au salon. */
  spaceId: string | null;
  title: string;
  description: string;
  intensity: Intensity;
  /** Langue de l'idée (« fr »/« en ») — renvoyée par l'API (API-16). */
  locale: string;
}

export interface MediaCreated {
  id: string;
  mime: string;
  viewOnce: boolean;
}

export type NotifMode = "push" | "digest" | "ghost";

export interface Settings {
  notifMode: NotifMode;
}

export interface VapidKey {
  publicKey: string;
}

export interface AuthConfig {
  passwordEnabled: boolean;
  oidcEnabled: boolean;
}
