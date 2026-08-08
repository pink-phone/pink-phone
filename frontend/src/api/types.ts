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
  /** Défaut du salon : nouveaux posts avec média téléchargeable (#78). */
  allowMediaDownload: boolean;
  /** Liste d'envies à double consentement (#99) activée pour ce salon. */
  desiresEnabled: boolean;
  /** Registre des libellés de la bucket list : explicite (défaut) vs suggestif. */
  desiresExplicitLabels: boolean;
  /** « Menu du soir » : rituel quotidien à double consentement (#97b). */
  eveningMenuEnabled: boolean;
  createdAt: string;
}

/** Une envie du catalogue (#99) côté membre courant : mon intérêt + état « matché ».
 *  L'intérêt brut des autres n'est jamais exposé (matched = réciprocité). */
export interface ApiDesire {
  /** Code stable du catalogue (libellé via i18n côté front). */
  code: string;
  /** Catégorie du catalogue (bucket list #99) — regroupement à l'écran. */
  category: string;
  /** J'ai marqué « envie » (privé, révélé seulement en cas de match). */
  interested: boolean;
  /** J'ai marqué « contre » (ma limite). */
  against: boolean;
  /** Réciprocité d'envie → révélé. */
  matched: boolean;
  /** Au moins un membre est « contre » → limite du couple (surfacée, bloque le match). */
  limit: boolean;
  /** Le couple a marqué « ✓ Réalisé » (suivi bucket list, niveau salon). */
  done: boolean;
}

/** Un item du « Menu du soir » (#97b) pour ce soir : mon choix du jour + match. */
export interface ApiEveningMenuItem {
  code: string;
  picked: boolean;
  matched: boolean;
}

/** Un « mot doux » (#102). `body` est null quand le mot m'est scellé (ouverture
 *  différée non échue) ; `sealed` le signale et `openAt` donne la date. */
export interface ApiLoveNote {
  id: string;
  authorId: string;
  authorName: string;
  body: string | null;
  sealed: boolean;
  openAt: string | null;
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

/** Un média d'une galerie de post (#87), dans l'ordre. */
export interface ApiPostMedia {
  id: string;
  /** Type MIME (distingue image / vidéo). */
  mime: string;
  /** Éphémère (« view once ») — propre au média. */
  viewOnce: boolean;
  /** Média éphémère déjà consommé. */
  consumed: boolean;
}

export interface ApiPost {
  id: string;
  authorId: string;
  authorName: string;
  title: string | null;
  body: string;
  /** Galerie de médias ordonnée (#87). Vide si aucun média. */
  media: ApiPostMedia[];
  /** Brouillon : visible du seul auteur, non notifié tant qu'il n'est pas publié. */
  draft: boolean;
  /** Média téléchargeable (#78). Sans effet sur un média éphémère. */
  allowDownload: boolean;
  createdAt: string;
  /** Dernière modification de contenu (= createdAt si jamais édité) — API-10. */
  updatedAt: string;
  // Clés = id de réaction prédéfinie OU emoji libre (réaction custom).
  reactionCounts: Record<string, number>;
  myReactions: string[];
  verdict: Verdict | null;
  /** Le post est dans MES favoris (marque-page personnel, #96). */
  isFavorite: boolean;
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
  /** Dernière édition (= createdAt si jamais édité) — RR-04. */
  updatedAt: string;
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
  feature: "blog" | "challenges" | "notices";
  seenAt: string;
}

/** Notice de salon affichée sur le dashboard (#84/#85). */
export interface Notice {
  id: string;
  /** 'member_joined' | 'download_enabled'. */
  kind: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
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
  /** Un défi issu de cette suggestion a déjà été réalisé dans le salon (#69). */
  done: boolean;
  /** Suggestion masquée par le salon (#70). */
  hidden: boolean;
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
