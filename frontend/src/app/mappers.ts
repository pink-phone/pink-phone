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
}

export function toPostData(
  posts: ApiPost[],
  { t, spaceId, userId, partnersSeen }: PostMapOptions,
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
  }));
}

export function toChallengeData(
  challenges: ApiChallenge[],
  userId: string,
): ChallengeData[] {
  return challenges.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    intensity: c.intensity,
    status: c.status,
    deadlineLabel: c.deadlineLabel ?? undefined,
    perspective: c.proposerId === userId ? "proposer" : "recipient",
  }));
}

export function toCommentViews(comments: ApiComment[]): CommentView[] {
  return comments.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    timeLabel: relativeTime(c.createdAt),
  }));
}
