import { useState } from "react";
import { Sheet } from "../Sheet/Sheet";
import { TextArea } from "../form/TextArea";
import { Button } from "../Button/Button";

export interface CommentView {
  id: string;
  authorName: string;
  body: string;
  timeLabel: string;
}

export interface CommentsSheetProps {
  open: boolean;
  comments: CommentView[];
  onClose: () => void;
  onAdd: (body: string) => void;
  /** Chargement de la liste. */
  loading?: boolean;
  /** Envoi d'un commentaire en cours. */
  busy?: boolean;
}

/** Fil de commentaires d'un post, dans une feuille modale. */
export function CommentsSheet({
  open,
  comments,
  onClose,
  onAdd,
  loading,
  busy,
}: CommentsSheetProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const body = draft.trim();
    if (!body || busy) return;
    onAdd(body);
    setDraft("");
  };

  return (
    <Sheet open={open} title="Échanger" onClose={onClose}>
      <div className="space-y-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-taupe-400">Chargement…</p>
        ) : comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-taupe-400">
            Personne n'a encore réagi. Lance la discussion.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl bg-charcoal-900/40 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-sm text-blush-100">
                    {c.authorName}
                  </span>
                  <span className="text-[11px] text-taupe-400">
                    {c.timeLabel}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-line text-sm text-taupe-200">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextArea
            label="Ta réponse"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Un mot, une envie…"
            rows={2}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={!draft.trim() || busy}
          >
            {busy ? "…" : "Envoyer"}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
