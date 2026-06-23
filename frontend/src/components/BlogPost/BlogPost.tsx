import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Surface } from "../Surface/Surface";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { SafeMedia } from "../SafeMedia/SafeMedia";
import { ReactionBar, type ReactionId } from "../ReactionBar/ReactionBar";
import { ContextMenu } from "../ContextMenu/ContextMenu";
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
  /** Image (défaut) ou vidéo. */
  kind?: "image" | "video";
  alt: string;
  viewOnce?: boolean;
  /** Média éphémère déjà consommé (état "Envolé…" persistant). */
  consumed?: boolean;
}

export interface BlogPostProps {
  author: BlogPostAuthor;
  /** Déjà formaté (ex: "Hier, 23 h"). Le formatage relève de l'appelant. */
  timeLabel: string;
  title?: string;
  body: string;
  media?: BlogPostMedia;
  reactionCounts?: Record<string, number>;
  myReactions?: string[];
  onToggleReaction?: (r: string) => void;
  /** Réactions actives du salon (ordre) + autorisation des réactions libres. */
  reactionOrder?: ReactionId[];
  allowCustomReactions?: boolean;
  commentCount?: number;
  onOpenComments?: () => void;
  /** Brouillon : affiche une pastille et (si `isMine`) le bouton Publier. */
  draft?: boolean;
  /** Post édité après publication : ajoute « · modifié » près de l'horodatage. */
  edited?: boolean;
  /** Post de l'utilisateur courant : débloque suppression et publication. */
  isMine?: boolean;
  onDelete?: () => void;
  onPublish?: () => void;
  /** Édition d'un brouillon (affiché si `draft` && `isMine`). */
  onEdit?: () => void;
  /**
   * Membres ayant vu mon post (accusé de lecture). Vide/absent = pas encore vu.
   * Le « ✓✓ Vu » s'affiche dès qu'au moins un membre a vu ; au clic, une bulle
   * liste qui a vu (et quand).
   */
  seenBy?: { name: string; timeLabel: string }[];
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
  reactionOrder,
  allowCustomReactions = true,
  commentCount = 0,
  onOpenComments,
  draft = false,
  edited = false,
  isMine = false,
  onDelete,
  onPublish,
  onEdit,
  seenBy,
  className,
}: BlogPostProps) {
  const { t } = useTranslation();
  const [seenOpen, setSeenOpen] = useState(false);
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
          <p className="text-xs text-taupe-300">
            {timeLabel}
            {edited && (
              <span className="text-taupe-400"> · {t("blog.edited")}</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {draft && <Badge tone="neutral">{t("blog.draftBadge")}</Badge>}
          {isMine && (onEdit || onDelete) && (
            <ContextMenu
              ariaLabel={t("common.actions")}
              items={[
                ...(onEdit
                  ? [{ label: t("common.edit"), onClick: onEdit }]
                  : []),
                ...(onDelete
                  ? [
                      {
                        label: t("common.delete"),
                        onClick: onDelete,
                        danger: true,
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      </header>

      {title && (
        <h3 className="font-serif text-xl text-spice-300">{title}</h3>
      )}

      {body && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-taupe-200">
          {body}
        </p>
      )}

      {media && (
        <SafeMedia
          src={media.src}
          loader={media.loader}
          kind={media.kind}
          alt={media.alt}
          viewOnce={media.viewOnce}
          consumed={media.consumed}
        />
      )}

      {draft ? (
        /* Brouillon : publier (l'édition/suppression passent par le menu « ⋯ »). */
        isMine &&
        onPublish && (
          <Button className="w-full" onClick={onPublish}>
            {t("blog.publishDraft")}
          </Button>
        )
      ) : (
        <>
          <ReactionBar
            counts={reactionCounts}
            mine={myReactions}
            onToggle={onToggleReaction}
            order={reactionOrder}
            allowCustom={allowCustomReactions}
          />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenComments}
              className="text-xs text-taupe-300 transition-colors duration-300 ease-felt hover:text-spice-300"
            >
              💬{" "}
              {commentCount > 0
                ? t("blog.commentsCount", { count: commentCount })
                : t("blog.commentsLeave")}
            </button>
            {isMine && seenBy && seenBy.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={seenOpen}
                  aria-label={t("blog.seenByAria")}
                  onClick={() => setSeenOpen((o) => !o)}
                  className="text-xs text-spice-300 transition-colors duration-300 ease-felt hover:text-spice-200"
                >
                  ✓✓ {t("blog.seenByPartner")}
                </button>
                {seenOpen && (
                  <>
                    {/* Voile transparent : un tap à côté referme la bulle. */}
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setSeenOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div
                      role="dialog"
                      aria-label={t("blog.seenByTitle")}
                      className="absolute bottom-full right-0 z-20 mb-1 min-w-[140px] rounded-2xl border border-charcoal-600/60 bg-charcoal-800 px-3 py-2 shadow-felt"
                    >
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-taupe-400">
                        {t("blog.seenByTitle")}
                      </p>
                      <ul className="space-y-1">
                        {seenBy.map((s) => (
                          <li
                            key={s.name}
                            className="flex items-baseline justify-between gap-3 text-xs"
                          >
                            <span className="text-blush-100">{s.name}</span>
                            <span className="text-taupe-400">{s.timeLabel}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Surface>
  );
}
