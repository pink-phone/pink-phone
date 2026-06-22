import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  /** Reste-t-il des commentaires plus anciens à charger ? */
  hasMore?: boolean;
  /** Chargement des commentaires plus anciens en cours. */
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/** Fil de commentaires d'un post, dans une feuille modale. */
export function CommentsSheet({
  open,
  comments,
  onClose,
  onAdd,
  loading,
  busy,
  hasMore,
  loadingMore,
  onLoadMore,
}: CommentsSheetProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  const submit = () => {
    const body = draft.trim();
    if (!body || busy) return;
    onAdd(body);
    setDraft("");
  };

  return (
    <Sheet open={open} title={t("comments.sheetTitle")} onClose={onClose}>
      <div className="space-y-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-taupe-400">
            {t("common.loading")}
          </p>
        ) : comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-taupe-400">
            {t("comments.empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {hasMore && (
              <li className="flex">
                <Button
                  variant="secondary"
                  size="sm"
                  className="mx-auto"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                >
                  {loadingMore ? t("common.loading") : t("comments.loadOlder")}
                </Button>
              </li>
            )}
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
          // Collé au bas de la feuille : reste visible au-dessus du clavier
          // virtuel iOS quand la liste défile (UI-UX4).
          className="sticky bottom-0 space-y-2 bg-charcoal-800 pb-1 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextArea
            label={t("comments.replyLabel")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("comments.replyPlaceholder")}
            rows={2}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={!draft.trim() || busy}
          >
            {busy ? "…" : t("common.send")}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
