import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../Sheet/Sheet";
import { TextArea } from "../form/TextArea";
import { Button } from "../Button/Button";
import { ContextMenu } from "../ContextMenu/ContextMenu";
import { UnreadDivider } from "../UnreadDivider/UnreadDivider";

export interface CommentView {
  id: string;
  authorName: string;
  body: string;
  timeLabel: string;
  /** Le commentaire appartient à l'utilisateur courant (active modifier/supprimer). */
  isMine?: boolean;
  /** Commentaire de l'autre, arrivé depuis mon dernier passage : pilote la ligne « non lus ». */
  unread?: boolean;
  /** Commentaire édité après coup (RR-04) → mention « · modifié ». */
  edited?: boolean;
}

export interface CommentsSheetProps {
  open: boolean;
  comments: CommentView[];
  onClose: () => void;
  onAdd: (body: string) => void;
  /** Édite un de mes commentaires (nouvelle valeur). Renvoie un succès optionnel
   * (REACT2-01) : si `false`, l'édition reste ouverte et signale l'échec. */
  onEdit?: (id: string, body: string) => void | Promise<boolean>;
  /** Supprime un de mes commentaires. */
  onDelete?: (id: string) => void;
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
  onEdit,
  onDelete,
  loading,
  busy,
  hasMore,
  loadingMore,
  onLoadMore,
}: CommentsSheetProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  // Édition inline : id du commentaire en cours d'édition + son brouillon.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(false);

  const submit = () => {
    const body = draft.trim();
    if (!body || busy) return;
    onAdd(body);
    setDraft("");
  };

  const startEdit = (c: CommentView) => {
    setEditingId(c.id);
    setEditDraft(c.body);
    setEditError(false);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
    setEditError(false);
  };
  // On N'EFFACE l'édition qu'au succès (REACT2-01) : un échec garde la saisie et
  // affiche une erreur, au lieu de perdre la modification en silence.
  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    if (!body || savingEdit) return;
    setSavingEdit(true);
    setEditError(false);
    try {
      const res = await onEdit?.(id, body);
      if (res === false) setEditError(true);
      else cancelEdit();
    } finally {
      setSavingEdit(false);
    }
  };

  // Fil chronologique (plus ancien en haut, plus récent en bas, façon messagerie) :
  // les non-lus sont en BAS. La ligne « Non lus » se pose AVANT le premier non lu
  // (lu au-dessus, non lu en dessous) — marqueur unique, sans ambiguïté de sens.
  const firstUnread = comments.findIndex((c) => c.unread);

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
            {comments.map((c, i) => (
              <Fragment key={c.id}>
                {/* Ligne « Non lus » : AVANT le premier commentaire non lu. */}
                {i === firstUnread && (
                  <li>
                    <UnreadDivider variant="unread" label={t("common.unread")} />
                  </li>
                )}
              <li
                className="rounded-2xl bg-charcoal-900/40 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-sm text-blush-100">
                    {c.authorName}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-taupe-400">
                      {c.timeLabel}
                      {c.edited && ` · ${t("blog.edited")}`}
                    </span>
                    {c.isMine && (onEdit || onDelete) && editingId !== c.id && (
                      <ContextMenu
                        ariaLabel={t("comments.actions")}
                        items={[
                          ...(onEdit
                            ? [
                                {
                                  label: t("common.edit"),
                                  onClick: () => startEdit(c),
                                },
                              ]
                            : []),
                          ...(onDelete
                            ? [
                                {
                                  label: t("common.delete"),
                                  danger: true,
                                  onClick: () => onDelete(c.id),
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </div>
                </div>
                {editingId === c.id ? (
                  <div className="mt-1 space-y-2">
                    <TextArea
                      label={t("comments.editLabel")}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={savingEdit}
                        disabled={!editDraft.trim() || savingEdit}
                        onClick={() => saveEdit(c.id)}
                      >
                        {t("common.save")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={savingEdit}
                        onClick={cancelEdit}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                    {editError && (
                      <p role="alert" className="text-xs text-spice-300">
                        {t("comments.editFailed")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-line text-sm text-taupe-200">
                    {c.body}
                  </p>
                )}
              </li>
              </Fragment>
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
