import { Surface } from "../Surface/Surface";
import { SafeMedia } from "../SafeMedia/SafeMedia";
import { ReactionBar, type ReactionId } from "../ReactionBar/ReactionBar";
import { VerdictPicker, type Verdict } from "../VerdictPicker/VerdictPicker";
import { cn } from "../../lib/cn";

export interface BlogPostAuthor {
  name: string;
  /** Initiale ou petit emoji affiché dans la pastille. */
  glyph?: string;
}

export interface BlogPostMedia {
  src?: string;
  /** Chargement paresseux du média authentifié (voir SafeMedia). */
  loader?: () => Promise<string>;
  alt: string;
  viewOnce?: boolean;
}

export interface BlogPostProps {
  author: BlogPostAuthor;
  /** Déjà formaté (ex: "Hier, 23 h"). Le formatage relève de l'appelant. */
  timeLabel: string;
  title?: string;
  body: string;
  media?: BlogPostMedia;
  reactionCounts?: Partial<Record<ReactionId, number>>;
  myReactions?: ReactionId[];
  onToggleReaction?: (r: ReactionId) => void;
  verdict?: Verdict | null;
  onVerdictChange?: (v: Verdict) => void;
  commentCount?: number;
  onOpenComments?: () => void;
  className?: string;
}

/** Carte d'un post du blog intime ("à tête reposée"). */
export function BlogPost({
  author,
  timeLabel,
  title,
  body,
  media,
  reactionCounts,
  myReactions,
  onToggleReaction,
  verdict,
  onVerdictChange,
  commentCount = 0,
  onOpenComments,
  className,
}: BlogPostProps) {
  return (
    <Surface tone="velvet" className={cn("w-full space-y-4", className)}>
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bordeaux-700 font-serif text-blush-100 shadow-felt-sm"
        >
          {author.glyph ?? author.name.charAt(0)}
        </span>
        <div className="leading-tight">
          <p className="font-serif text-lg text-blush-100">{author.name}</p>
          <p className="text-xs text-taupe-400">{timeLabel}</p>
        </div>
      </header>

      {title && (
        <h3 className="font-serif text-xl text-spice-300">{title}</h3>
      )}

      <p className="whitespace-pre-line text-sm leading-relaxed text-taupe-200">
        {body}
      </p>

      {media && (
        <SafeMedia
          src={media.src}
          loader={media.loader}
          alt={media.alt}
          viewOnce={media.viewOnce}
        />
      )}

      <ReactionBar
        counts={reactionCounts}
        mine={myReactions}
        onToggle={onToggleReaction}
      />

      <VerdictPicker value={verdict} onChange={onVerdictChange} />

      <button
        type="button"
        onClick={onOpenComments}
        className="text-xs text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
      >
        💬 {commentCount > 0 ? `${commentCount} commentaire${commentCount > 1 ? "s" : ""}` : "Laisser un mot"}
      </button>
    </Surface>
  );
}
