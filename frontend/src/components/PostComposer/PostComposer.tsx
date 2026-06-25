import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../form/TextField";
import { TextArea } from "../form/TextArea";
import { Toggle } from "../form/Toggle";
import { Button } from "../Button/Button";

/** Un média de la galerie en cours d'édition (#87) : déjà uploadé OU nouveau. */
export type ComposerMediaItem =
  | { kind: "existing"; id: string }
  | { kind: "new"; file: File };

export interface PostDraft {
  title?: string;
  body: string;
  /** Galerie ordonnée (#87) : médias existants (par id) + nouveaux fichiers. */
  media: ComposerMediaItem[];
  /** Éphémère « view once » appliqué aux NOUVEAUX médias (post-level). */
  viewOnce: boolean;
  /** Médias téléchargeables (#78) — post-level. */
  allowDownload: boolean;
  /** Enregistré comme brouillon (non publié, non notifié). */
  draft: boolean;
}

/** Description d'un média déjà attaché (édition) : pour l'ordre et l'aperçu. */
export interface InitialMedia {
  id: string;
  viewOnce: boolean;
  kind?: "image" | "video";
}

export interface PostComposerProps {
  /** Peut renvoyer une `Promise` → état « en cours » pendant l'upload. */
  onSubmit: (draft: PostDraft) => void | Promise<void>;
  onCancel?: () => void;
  /** Valeur initiale du toggle « téléchargeable » (#78). */
  defaultAllowDownload?: boolean;
  /** Médias pré-joints (partage natif #86/#87) : ajoutés comme nouveaux médias. */
  initialFiles?: File[];
  /** Valeurs initiales (édition). `media` = galerie déjà attachée, ordonnée. */
  initial?: {
    title?: string;
    body?: string;
    /** Statut du post édité : false = publié (pas d'option « brouillon »). */
    draft?: boolean;
    media?: InitialMedia[];
  };
}

// État interne d'un item (porte l'object URL d'aperçu pour les nouveaux fichiers).
type Item =
  | { kind: "existing"; id: string; viewOnce: boolean; mediaKind: "image" | "video" }
  | { kind: "new"; file: File; url: string; mediaKind: "image" | "video" };

function fileKind(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

const MAX_MEDIA = 10;

/** Formulaire de rédaction d'un post du blog intime (galerie multi-médias #87). */
export function PostComposer({
  onSubmit,
  onCancel,
  initial,
  defaultAllowDownload = false,
  initialFiles,
}: PostComposerProps) {
  const { t } = useTranslation();
  const editing = initial !== undefined;
  const editingPublished = editing && initial?.draft === false;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [items, setItems] = useState<Item[]>(() => {
    const existing: Item[] = (initial?.media ?? []).map((m) => ({
      kind: "existing",
      id: m.id,
      viewOnce: m.viewOnce,
      mediaKind: m.kind ?? "image",
    }));
    for (const file of (initialFiles ?? []).slice(0, MAX_MEDIA - existing.length)) {
      existing.push({
        kind: "new",
        file,
        url: URL.createObjectURL(file),
        mediaKind: fileKind(file),
      });
    }
    return existing;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [allowDownload, setAllowDownload] = useState(defaultAllowDownload);
  const [pending, setPending] = useState<"primary" | "draft" | null>(null);
  const mounted = useRef(true);
  // Révoque tous les object URLs des nouveaux fichiers au démontage.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () => {
      mounted.current = false;
      for (const it of itemsRef.current) {
        if (it.kind === "new") URL.revokeObjectURL(it.url);
      }
    },
    [],
  );

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setItems((prev) => {
      const room = MAX_MEDIA - prev.length;
      const next = Array.from(files)
        .slice(0, Math.max(0, room))
        .map<Item>((file) => ({
          kind: "new",
          file,
          url: URL.createObjectURL(file),
          mediaKind: fileKind(file),
        }));
      return [...prev, ...next];
    });
  };

  const removeAt = (i: number) =>
    setItems((prev) => {
      const it = prev[i];
      if (it?.kind === "new") URL.revokeObjectURL(it.url);
      return prev.filter((_, j) => j !== i);
    });

  const move = (i: number, dir: -1 | 1) =>
    setItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const hasMedia = items.length > 0;
  const hasNew = items.some((it) => it.kind === "new");
  const canSubmit = body.trim().length > 0 || hasMedia;
  const busy = pending !== null;

  const submit = async (draft: boolean) => {
    if (!canSubmit || busy) return;
    setPending(draft ? "draft" : "primary");
    try {
      await onSubmit({
        title: title.trim() || undefined,
        body: body.trim(),
        media: items.map((it) =>
          it.kind === "existing"
            ? { kind: "existing", id: it.id }
            : { kind: "new", file: it.file },
        ),
        viewOnce: hasNew ? viewOnce : false,
        allowDownload,
        draft,
      });
    } finally {
      if (mounted.current) setPending(null);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <TextField
        label={t("postComposer.titleLabel")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("postComposer.titlePlaceholder")}
      />
      <TextArea
        label={t("postComposer.bodyLabel")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("postComposer.bodyPlaceholder")}
        rows={editing ? 14 : 5}
      />

      <div className="space-y-2">
        <span className="block text-xs font-medium text-taupe-200">
          {t("postComposer.mediaLabel")}
        </span>

        {/* Liste ordonnée des médias (réordo ▲▼ + retrait ✕). */}
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li
                key={it.kind === "existing" ? `e-${it.id}` : `n-${i}-${it.file.name}`}
                className="flex items-center gap-2 rounded-2xl border border-charcoal-600/60 bg-charcoal-800 p-2"
              >
                {it.kind === "new" && it.mediaKind === "image" ? (
                  <img
                    src={it.url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-charcoal-700 text-xl"
                  >
                    {it.mediaKind === "video" ? "🎬" : "🖼️"}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-taupe-300">
                  {it.kind === "new"
                    ? it.file.name
                    : it.viewOnce
                      ? t("postComposer.ephemeralAttached")
                      : t("postComposer.attachedAlt")}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={t("postComposer.moveUp")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-taupe-300 hover:text-blush-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label={t("postComposer.moveDown")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-taupe-300 hover:text-blush-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={t("postComposer.remove")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-taupe-300 hover:text-spice-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {items.length < MAX_MEDIA && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="truncate">📎 {t("postComposer.attachFile")}</span>
          </Button>
        )}
      </div>

      {/* Éphémère : s'applique aux NOUVEAUX médias. */}
      {hasNew && (
        <Toggle
          checked={viewOnce}
          onChange={setViewOnce}
          label={t("postComposer.ephemeralToggle")}
          hint={t("postComposer.ephemeralHint")}
        />
      )}

      {/* Téléchargeable (#78) : dès qu'il y a un média (post-level). */}
      {hasMedia && (
        <Toggle
          checked={allowDownload}
          onChange={setAllowDownload}
          label={t("postComposer.downloadToggle")}
          hint={t("postComposer.downloadHint")}
        />
      )}

      <div className="space-y-2 pt-1">
        <div className="flex gap-2">
          <Button
            type="submit"
            className="flex-1"
            disabled={!canSubmit || busy}
            loading={pending === "primary"}
          >
            {pending === "primary"
              ? editingPublished
                ? t("postComposer.saving")
                : t("postComposer.publishing")
              : editingPublished
                ? t("postComposer.saveEdits")
                : t("postComposer.publish")}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
        {!editingPublished && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!canSubmit || busy}
            loading={pending === "draft"}
            onClick={() => submit(true)}
          >
            {pending === "draft"
              ? t("postComposer.saving")
              : t("postComposer.saveDraft")}
          </Button>
        )}
      </div>
    </form>
  );
}
