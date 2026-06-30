import { useTranslation } from "react-i18next";
import { Button } from "../Button/Button";
import { LoveNote } from "../LoveNote/LoveNote";
import { cn } from "../../lib/cn";
import type { ApiLoveNote } from "../../api/types";

export interface LoveNoteWallProps {
  notes: ApiLoveNote[];
  /** Id de l'utilisateur courant (pour distinguer mes mots). */
  userId: string;
  /** Ouvre le composer (feuille) — bouton « ＋ Glisser un mot doux ». */
  onCompose?: () => void;
  onDelete?: (id: string) => void;
  className?: string;
}

/**
 * Mur de « mots doux » (#102) en mode CONSULTATION : on met en valeur les mots
 * reçus, et l'écriture passe par un bouton qui ouvre une feuille (le composer
 * vit ailleurs). Allège le dashboard (plus de gros champ de saisie passif).
 */
export function LoveNoteWall({
  notes,
  userId,
  onCompose,
  onDelete,
  className,
}: LoveNoteWallProps) {
  const { t } = useTranslation();

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-taupe-100">
          {t("loveNotes.title")}
        </h2>
        {onCompose && (
          <Button size="sm" onClick={onCompose}>
            {t("loveNotes.compose")}
          </Button>
        )}
      </div>

      {notes.length === 0 ? (
        <p className="text-center text-xs text-taupe-400">
          {t("loveNotes.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {notes.map((n) => (
            <LoveNote
              key={n.id}
              authorName={n.authorName}
              body={n.body}
              sealed={n.sealed}
              openAt={n.openAt}
              isMine={n.authorId === userId}
              onDelete={onDelete ? () => onDelete(n.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
