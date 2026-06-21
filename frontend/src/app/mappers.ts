import type { TFunction } from "i18next";
import * as api from "../api/client";
import type { ApiChallenge, ApiComment, ApiPost } from "../api/types";
import type { ChallengeData, PostData } from "../types/view";
import { relativeTime } from "../lib/time";

// Conversions pures réponses API → vue-modèles des écrans. Isolées de la couche
// orchestration : aucune dépendance à l'état React, testables telles quelles.

export interface CommentView {
  id: string;
  authorName: string;
  body: string;
  timeLabel: string;
}

interface PostMapOptions {
  t: TFunction;
  spaceId: string;
  userId: string;
  /** "Vu" du blog par le/la partenaire (pour l'accusé de lecture). */
  partnerBlogSeen?: string;
}

export function toPostData(
  posts: ApiPost[],
  { t, spaceId, userId, partnerBlogSeen }: PostMapOptions,
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
    isMine: p.authorId === userId,
    seenByPartner:
      p.authorId === userId &&
      !p.draft &&
      !!partnerBlogSeen &&
      p.createdAt <= partnerBlogSeen,
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
