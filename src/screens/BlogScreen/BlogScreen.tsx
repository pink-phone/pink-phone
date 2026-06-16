import { useTranslation } from "react-i18next";
import { BlogPost } from "../../components/BlogPost/BlogPost";
import { Button } from "../../components/Button/Button";
import type { PostData } from "../../mock/data";

export interface BlogScreenProps {
  posts: PostData[];
  onCompose?: () => void;
  onToggleReaction?: (postId: string, reaction: string) => void;
  onOpenComments?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onPublishPost?: (postId: string) => void;
  onEditPost?: (postId: string) => void;
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
}: BlogScreenProps) {
  const { t } = useTranslation();
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
          {posts.map((post) => (
            <BlogPost
              key={post.id}
              author={post.author}
              timeLabel={post.timeLabel}
              title={post.title}
              body={post.body}
              media={post.media}
              reactionCounts={post.reactionCounts}
              myReactions={post.myReactions}
              commentCount={post.commentCount}
              draft={post.draft}
              isMine={post.isMine}
              seenByPartner={post.seenByPartner}
              className="max-w-none"
              onToggleReaction={(r) => onToggleReaction?.(post.id, r)}
              onOpenComments={() => onOpenComments?.(post.id)}
              onDelete={() => onDeletePost?.(post.id)}
              onPublish={() => onPublishPost?.(post.id)}
              onEdit={() => onEditPost?.(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
