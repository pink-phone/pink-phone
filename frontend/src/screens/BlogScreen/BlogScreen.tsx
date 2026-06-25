import { Fragment, useState } from "react";
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

const DRAFTS_OPEN_KEY = "pp_drafts_open";

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

  // Brouillons (mes posts non publiés) sortis du fil et regroupés dans une
  // section repliable en tête (#91) — ils encombraient le haut du blog. Le fil,
  // lui, n'a plus que des posts publiés → la logique « non lus » se simplifie.
  const drafts = posts.filter((p) => p.draft);
  const feed = posts.filter((p) => !p.draft);

  // Repli/dépli persisté par appareil (replié par défaut), avec garde pour les
  // contextes sans localStorage (jsdom/Node, mode privé).
  const [draftsOpen, setDraftsOpen] = useState(() => {
    try {
      return localStorage.getItem(DRAFTS_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleDrafts = () =>
    setDraftsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(DRAFTS_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  // Fil anté-chronologique : les non-lus sont en haut. Marqueur supérieur
  // (« Non lus », braise) rendu avant feed[0] ; marqueur inférieur (« Déjà lu »,
  // neutre) après le dernier non-lu, seulement s'il reste des items en dessous.
  let dividerAfter = -1;
  feed.forEach((p, i) => {
    if (p.unread) dividerAfter = i;
  });
  const showBottomDivider =
    dividerAfter >= 0 && dividerAfter < feed.length - 1;

  const renderPost = (post: PostData) => (
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
  );

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
          {/* Section brouillons repliable (repliée par défaut). */}
          {drafts.length > 0 && (
            <div className="space-y-5">
              <button
                type="button"
                onClick={toggleDrafts}
                aria-expanded={draftsOpen}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-taupe-300/30 bg-charcoal-800/40 px-4 py-2.5 text-sm text-taupe-200 transition-colors duration-300 ease-felt hover:border-spice-400/40 hover:text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                <span>✎ {t("blog.draftsToggle", { count: drafts.length })}</span>
                <span aria-hidden className="text-xs text-taupe-400">
                  {draftsOpen ? "▾" : "▸"}
                </span>
              </button>
              {draftsOpen &&
                drafts.map((post) => (
                  <Fragment key={post.id}>{renderPost(post)}</Fragment>
                ))}
            </div>
          )}

          {/* Le fil publié, avec marqueurs « non lus » / « déjà lu ». */}
          {feed.map((post, i) => (
            <Fragment key={post.id}>
              {i === 0 && dividerAfter >= 0 && (
                <UnreadDivider variant="unread" label={t("common.unread")} />
              )}
              {renderPost(post)}
              {i === dividerAfter && showBottomDivider && (
                <UnreadDivider
                  variant="alreadyRead"
                  label={t("common.alreadyRead")}
                />
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
