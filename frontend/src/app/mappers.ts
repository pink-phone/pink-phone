import type { TFunction } from "i18next";
import * as api from "../api/client";
import type { ApiChallenge, ApiComment, ApiPost } from "../api/types";
import type { ChallengeData, PostData } from "../types/view";
import type { CommentView } from "../components/CommentsSheet/CommentsSheet";
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
    media: p.mediaId
      ? {
          alt: t("blog.sharedPhotoAlt"),
          kind: p.mediaMime?.startsWith("video/") ? "video" : "image",
          viewOnce: p.mediaViewOnce ?? false,
          consumed: p.mediaConsumed ?? false,
          // Téléchargeable seulement si le post l'autorise ET média non éphémère.
          downloadable: p.allowDownload && !(p.mediaViewOnce ?? false),
          loader: () => api.fetchMediaObjectUrl(spaceId, p.mediaId as string),
        }
      : undefined,
    reactionCounts: p.reactionCounts,
    myReactions: p.myReactions,
    verdict: p.verdict,
    commentCount: p.commentCount,
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
  }));
}
