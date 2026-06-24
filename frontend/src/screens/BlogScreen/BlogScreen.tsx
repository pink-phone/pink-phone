import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { BlogPost } from "../../components/BlogPost/BlogPost";
import { Button } from "../../components/Button/Button";
import { UnreadDivider } from "../../components/UnreadDivider/UnreadDivider";
import type { ReactionId } from "../../components/ReactionBar/ReactionBar";
import type { PostData } from "../../types/view";

export interface BlogScreenProps {
  posts: PostData[];
  onCompose?: () => void;
  onToggleReaction?: (postId: string, reaction: string) => void;
  onOpenComments?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onPublishPost?: (postId: string) => void;
  onEditPost?: (postId: string) => void;
  /** Config des réactions du salon (ordre + réactions libres). */
  reactionOrder?: ReactionId[];
  allowCustomReactions?: boolean;
  /** Reste-t-il des posts plus anciens à charger ? (pagination par curseur) */
  hasMore?: boolean;
  /** Chargement de la page suivante en cours. */
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/** Le fil du blog intime ("à tête reposée"). */
export function BlogScreen({
  posts,
  onCompose,
  onToggleReaction,
  onOpenComments,
  onDeletePost,
  onPublishPost,
  onEditPost,
  reactionOrder,
  allowCustomReactions,
  hasMore,
  loadingMore,
  onLoadMore,
}: BlogScreenProps) {
  const { t } = useTranslation();
  // Fil anté-chronologique : les non-lus sont en haut. La ligne « non lus » se
  // pose juste sous le dernier post non lu (frontière avec le déjà-vu).
  let lastUnread = -1;
  posts.forEach((p, i) => {
    if (p.unread) lastUnread = i;
  });
  // Un brouillon ne doit JAMAIS être dans la zone non lu (au-dessus de la ligne).
  // Comme un brouillon fraîchement écrit est le plus récent, il s'y retrouverait.
  // On extrait donc les brouillons de la bande au-dessus du séparateur et on les
  // rend juste en dessous (ils restent exclus du flag `unread` côté mapper).
  let ordered = posts;
  let dividerAfter = lastUnread;
  if (lastUnread >= 0) {
    const band = posts.slice(0, lastUnread + 1);
    const above = band.filter((p) => !p.draft);
    const movedDrafts = band.filter((p) => p.draft);
    ordered = [...above, ...movedDrafts, ...posts.slice(lastUnread + 1)];
    dividerAfter = above.length - 1;
  }
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-2">
        <h1 className="font-serif text-2xl text-blush-100">{t("blog.title")}</h1>
        <Button size="sm" onClick={onCompose}>
          {t("blog.compose")}
        </Button>
      </header>

      {posts.length === 0 ? (
        <p className="py-12 text-center text-sm text-taupe-400">
          {t("blog.empty")}
        </p>
      ) : (
        <div className="flex flex-col items-stretch gap-5">
          {ordered.map((post, i) => (
            <Fragment key={post.id}>
            <BlogPost
              author={post.author}
              timeLabel={post.timeLabel}
              title={post.title}
              body={post.body}
              media={post.media}
              reactionCounts={post.reactionCounts}
              myReactions={post.myReactions}
              commentCount={post.commentCount}
              hasUnreadComments={post.hasUnreadComments}
              draft={post.draft}
              edited={post.edited}
              isMine={post.isMine}
              seenBy={post.seenBy}
              reactionOrder={reactionOrder}
              allowCustomReactions={allowCustomReactions}
              className="max-w-none"
              onToggleReaction={(r) => onToggleReaction?.(post.id, r)}
              onOpenComments={() => onOpenComments?.(post.id)}
              onDelete={() => onDeletePost?.(post.id)}
              onPublish={() => onPublishPost?.(post.id)}
              onEdit={() => onEditPost?.(post.id)}
            />
              {i === dividerAfter && (
                <UnreadDivider label={t("common.unread")} />
              )}
            </Fragment>
          ))}
          {hasMore && (
            <Button
              variant="secondary"
              size="sm"
              className="mx-auto"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? t("common.loading") : t("common.loadMore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
