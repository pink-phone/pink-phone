import type { TFunction } from "i18next";
import * as api from "../api/client";
import type {
  ApiChallenge,
  ApiComment,
  ApiEveningMenuItem,
  ApiNotification,
  ApiPost,
  Notice,
} from "../api/types";
import type { ChallengeData, EveningMenuPreviewRow, PostData } from "../types/view";
import type { CommentView } from "../components/CommentsSheet/CommentsSheet";
import type { NotificationItemView } from "../components/NotificationCenter/NotificationCenter";
import { relativeTime } from "../lib/time";

// Conversions pures réponses API → vue-modèles des écrans. Isolées de la couche
// orchestration : aucune dépendance à l'état React, testables telles quelles.
// `CommentView` est le type de prop de `CommentsSheet` (le composant le possède).
export type { CommentView };

interface PostMapOptions {
  t: TFunction;
  spaceId: string;
  userId: string;
  /**
   * Les autres membres + leur dernier « vu » du blog (pour l'accusé de lecture
   * nominatif : qui a vu mes posts, et quand).
   */
  partnersSeen?: { name: string; seenAt?: string }[];
  /**
   * Mon dernier « vu » du blog, figé à l'arrivée sur l'onglet : un post de
   * l'autre créé après est « non lu » (pilote la ligne séparatrice). Absent ⇒
   * pas de ligne.
   */
  blogSeenAt?: string | null;
}

export function toPostData(
  posts: ApiPost[],
  { t, spaceId, userId, partnersSeen, blogSeenAt }: PostMapOptions,
): PostData[] {
  return posts.map((p) => ({
    id: p.id,
    author: { name: p.authorName, glyph: p.authorName.charAt(0) },
    timeLabel: relativeTime(p.createdAt),
    title: p.title ?? undefined,
    body: p.body,
    // Galerie ordonnée (#87) : chaque média → vue-modèle SafeMedia.
    media: p.media.map((m) => ({
      alt: t("blog.sharedPhotoAlt"),
      kind: m.mime.startsWith("video/") ? ("video" as const) : ("image" as const),
      viewOnce: m.viewOnce,
      consumed: m.consumed,
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      // Téléchargeable seulement si le post l'autorise ET média non éphémère.
      downloadable: p.allowDownload && !m.viewOnce,
      loader: () => api.fetchMediaObjectUrl(spaceId, m.id),
    })),
    reactionCounts: p.reactionCounts,
    myReactions: p.myReactions,
    verdict: p.verdict,
    commentCount: p.commentCount,
    isFavorite: p.isFavorite,
    draft: p.draft,
    edited: !p.draft && p.updatedAt > p.createdAt,
    isMine: p.authorId === userId,
    // Accusé de lecture nominatif : pour MON post publié, les membres dont le
    // dernier « vu » du blog est postérieur à sa création (#52 multi-membres).
    seenBy:
      p.authorId === userId && !p.draft
        ? (partnersSeen ?? [])
            .filter((m) => m.seenAt && p.createdAt <= m.seenAt)
            .map((m) => ({ name: m.name, timeLabel: relativeTime(m.seenAt!) }))
        : undefined,
    unread:
      p.authorId !== userId &&
      !p.draft &&
      !!blogSeenAt &&
      p.createdAt > blogSeenAt,
    // `lastCommentAt` = dernier commentaire d'AUTRUI (côté API) → non lu s'il est
    // postérieur à mon dernier passage figé (même snapshot que la ligne #77).
    hasUnreadComments:
      !!p.lastCommentAt && !!blogSeenAt && p.lastCommentAt > blogSeenAt,
  }));
}

export function toChallengeData(
  challenges: ApiChallenge[],
  userId: string,
  /** Mon dernier « vu » des défis, figé à l'arrivée (cf. `blogSeenAt`). */
  challSeenAt?: string | null,
): ChallengeData[] {
  return challenges.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    intensity: c.intensity,
    status: c.status,
    deadlineLabel: c.deadlineLabel ?? undefined,
    perspective: c.proposerId === userId ? "proposer" : "recipient",
    unread:
      c.proposerId !== userId && !!challSeenAt && c.createdAt > challSeenAt,
  }));
}

/** Vue-modèle d'une notice affichée au dashboard (#84/#85). */
export interface NoticeView {
  id: string;
  kind: string;
  actorName?: string;
}

/**
 * Notices NON vues à afficher : plus récentes que mon « vu » figé à l'arrivée
 * (`seenAt`). Sans snapshot (jamais vu) ⇒ toutes. `actorName` null → undefined.
 */
export function toDashboardNotices(
  notices: Notice[],
  seenAt?: string | null,
): NoticeView[] {
  return notices
    .filter((n) => !seenAt || n.createdAt > seenAt)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      actorName: n.actorName ?? undefined,
    }));
}

export function toNotificationItems(
  notifications: ApiNotification[],
): NotificationItemView[] {
  return notifications.map((n) => ({
    id: n.id,
    kind: n.kind,
    actorName: n.actorName,
    entityId: n.entityId,
    read: n.read,
    timeLabel: relativeTime(n.createdAt),
  }));
}

export function toCommentViews(
  comments: ApiComment[],
  userId?: string,
  /** Mon dernier « vu » du blog, figé à l'arrivée : un commentaire de l'autre
   * créé après est « non lu » (pilote la ligne séparatrice, comme #76). */
  seenAt?: string | null,
): CommentView[] {
  return comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    timeLabel: relativeTime(c.createdAt),
    isMine: c.authorId === userId,
    unread: c.authorId !== userId && !!seenAt && c.createdAt > seenAt,
    edited: c.updatedAt > c.createdAt,
  }));
}

const COURSES = ["starter", "main", "dessert"] as const;

/** Aperçu du menu du soir pour le dashboard (114a) : par service, les items
 *  déjà sur le menu (choisis par moi ou proposés par l'autre, hors refusés),
 *  libellés résolus (langue + registre explicite/suggestif). Toujours les 3
 *  services, dans l'ordre d'un repas — un service vide a `labels: []` (la tuile
 *  garde ainsi une structure stable quand un seul service est rempli). */
export function toEveningMenuPreview(
  items: ApiEveningMenuItem[],
  { isEn, explicit }: { isEn: boolean; explicit: boolean },
): EveningMenuPreviewRow[] {
  const labelFor = (i: ApiEveningMenuItem): string => {
    if (!explicit) {
      const soft = isEn ? i.labelEnSoft : i.labelFrSoft;
      if (soft) return soft;
    }
    return isEn ? i.labelEn : i.labelFr;
  };
  const rows: EveningMenuPreviewRow[] = [];
  for (const course of COURSES) {
    const on = items.filter(
      (i) => i.course === course && !i.refused && (i.picked || i.partnerWants),
    );
    rows.push({
      course,
      labels: on.map(labelFor),
      matched: on.some((i) => i.matched && i.picked),
    });
  }
  return rows;
}
