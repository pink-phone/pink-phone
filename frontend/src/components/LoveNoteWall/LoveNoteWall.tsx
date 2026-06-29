import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../Button/Button";
import { TextArea } from "../form/TextArea";
import { LoveNote } from "../LoveNote/LoveNote";
import { cn } from "../../lib/cn";
import type { ApiLoveNote } from "../../api/types";

export interface LoveNoteWallProps {
  notes: ApiLoveNote[];
  /** Id de l'utilisateur courant (pour distinguer mes mots). */
  userId: string;
  /** Envoie un mot ; `openAt` ISO optionnel (différé). Renvoie un succès. */
  onSend: (body: string, openAt?: string) => Promise<boolean> | boolean;
  onDelete?: (id: string) => void;
  className?: string;
}

/** Mur de « mots doux » (#102) : composer (avec ouverture différée) + post-it. */
export function LoveNoteWall({
  notes,
  userId,
  onSend,
  onDelete,
  className,
}: LoveNoteWallProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    // datetime-local = heure locale ; toISOString() la convertit en UTC.
    const openAt =
      scheduling && when ? new Date(when).toISOString() : undefined;
    const ok = await onSend(draft.trim(), openAt);
    setSending(false);
    if (ok) {
      setDraft("");
      setWhen("");
      setScheduling(false);
    }
  };

  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="font-serif text-lg text-taupe-100">
        {t("loveNotes.title")}
      </h2>

      <div className="space-y-2">
        <TextArea
          label={t("loveNotes.composerLabel")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("loveNotes.placeholder")}
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScheduling((s) => !s)}
            aria-pressed={scheduling}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ease-felt",
              scheduling
                ? "border-spice-500/70 bg-charcoal-800 text-blush-100"
                : "border-charcoal-600/60 text-taupe-300 hover:border-spice-400/40 hover:text-blush-100",
            )}
          >
            🕐 {t("loveNotes.schedule")}
          </button>
          {scheduling && (
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label={t("loveNotes.scheduleAria")}
              className="rounded-xl border border-charcoal-600/60 bg-charcoal-800 px-2 py-1.5 text-xs text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            />
          )}
          <Button
            size="sm"
            className="ml-auto"
            loading={sending}
            disabled={!draft.trim() || (scheduling && !when)}
            onClick={send}
          >
            {t("loveNotes.send")}
          </Button>
        </div>
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
