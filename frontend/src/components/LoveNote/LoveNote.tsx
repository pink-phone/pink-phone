import { useTranslation } from "react-i18next";
import { Surface } from "../Surface/Surface";
import { cn } from "../../lib/cn";

export interface LoveNoteProps {
  authorName: string;
  /** Corps du mot — `null` quand il m'est scellé (ouverture différée non échue). */
  body: string | null;
  /** Mot scellé pour moi : on affiche un teaser, pas le contenu. */
  sealed: boolean;
  /** Date d'ouverture (ISO) si différé — affichée sur le teaser scellé. */
  openAt?: string | null;
  /** Le mot est de moi → bouton de suppression. */
  isMine?: boolean;
  onDelete?: () => void;
  className?: string;
}

function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Un « mot doux » (#102) façon post-it. Scellé = teaser cadenassé jusqu'à sa date. */
export function LoveNote({
  authorName,
  body,
  sealed,
  openAt,
  isMine = false,
  onDelete,
  className,
}: LoveNoteProps) {
  const { t, i18n } = useTranslation();

  if (sealed) {
    return (
      <Surface
        tone="velvet"
        className={cn(
          "flex flex-col items-center gap-1 border-dashed text-center",
          className,
        )}
      >
        <span aria-hidden className="text-3xl">
          🔒
        </span>
        <p className="font-serif text-sm text-blush-100">
          {t("loveNotes.sealedTitle")}
        </p>
        {openAt && (
          <p className="text-xs text-taupe-300">
            {t("loveNotes.opensAt", { date: formatDate(openAt, i18n.language) })}
          </p>
        )}
        <p className="text-xs text-taupe-400">
          {t("loveNotes.from", { name: authorName })}
        </p>
      </Surface>
    );
  }

  // Un mot à moi, encore programmé pour plus tard (je vois mon contenu).
  const scheduled = isMine && !!openAt && new Date(openAt) > new Date();

  return (
    <Surface tone="blush" className={cn("relative space-y-2", className)}>
      {isMine && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("loveNotes.deleteAria")}
          className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-bordeaux-700/50 transition-colors duration-300 ease-felt hover:text-bordeaux-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
        >
          <span aria-hidden>✕</span>
        </button>
      )}
      <p className="whitespace-pre-line pr-7 font-serif text-base leading-relaxed text-bordeaux-700">
        {body}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-bordeaux-700/70">
        <span>{t("loveNotes.from", { name: authorName })}</span>
        {scheduled && openAt && (
          <span className="rounded-full bg-bordeaux-700/10 px-2 py-0.5">
            🕐 {t("loveNotes.scheduledFor", { date: formatDate(openAt, i18n.language) })}
          </span>
        )}
      </div>
    </Surface>
  );
}
