import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../Button/Button";
import { TextArea } from "../form/TextArea";
import { cn } from "../../lib/cn";

export interface LoveNoteComposerProps {
  /** Envoie un mot ; `openAt` ISO optionnel (différé). Renvoie un succès. */
  onSend: (body: string, openAt?: string) => Promise<boolean> | boolean;
  /** Appelé après un envoi réussi (ex. fermer la feuille). */
  onSent?: () => void;
  className?: string;
}

/** Le formulaire d'un « mot doux » (#102) : texte + ouverture différée optionnelle.
 *  Vit dans une feuille (Sheet) ouverte depuis le mur de mots doux. */
export function LoveNoteComposer({
  onSend,
  onSent,
  className,
}: LoveNoteComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!draft.trim() || sending || (scheduling && !when)) return;
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
      onSent?.();
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <TextArea
        label={t("loveNotes.composerLabel")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("loveNotes.placeholder")}
        rows={3}
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
  );
}
