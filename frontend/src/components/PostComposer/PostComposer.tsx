import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../form/TextField";
import { TextArea } from "../form/TextArea";
import { Toggle } from "../form/Toggle";
import { Button } from "../Button/Button";
import { SafeMedia } from "../SafeMedia/SafeMedia";

export interface PostDraft {
  title?: string;
  body: string;
  file?: File;
  viewOnce: boolean;
  /** Enregistré comme brouillon (non publié, non notifié). */
  draft: boolean;
  /** Édition : retirer la photo déjà jointe (sans en attacher de nouvelle). */
  removeMedia?: boolean;
}

export interface PostComposerProps {
  onSubmit: (draft: PostDraft) => void;
  onCancel?: () => void;
  /**
   * Valeurs initiales (édition d'un brouillon). `media` décrit la photo déjà
   * jointe : un média éphémère n'est pas affiché (il serait consommé), un média
   * normal a un aperçu (révélé au press-hold via `loader`). Dans les deux cas on
   * peut la remplacer ou la retirer.
   */
  initial?: {
    title?: string;
    body?: string;
    /** Statut du post édité : false = publié (pas d'option « brouillon »). */
    draft?: boolean;
    media?: {
      viewOnce: boolean;
      loader?: () => Promise<string>;
      alt?: string;
      kind?: "image" | "video";
    };
  };
}

/** Image / vidéo d'après le type MIME du fichier choisi. */
function fileKind(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

/** Formulaire de rédaction d'un post du blog intime. */
export function PostComposer({ onSubmit, onCancel, initial }: PostComposerProps) {
  const { t } = useTranslation();
  const editing = initial !== undefined;
  // Édition d'un post déjà publié : on enregistre (reste publié), pas de brouillon.
  const editingPublished = editing && initial?.draft === false;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // Photo déjà jointe au brouillon, tant qu'on ne la remplace/retire pas.
  const [removeMedia, setRemoveMedia] = useState(false);
  const existingMedia =
    initial?.media && !file && !removeMedia ? initial.media : null;

  // Aperçu local (object URL) du fichier choisi.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canSubmit = body.trim().length > 0;

  const submit = (draft: boolean) => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim() || undefined,
      body: body.trim(),
      file: file ?? undefined,
      viewOnce: file ? viewOnce : false,
      draft,
      removeMedia: removeMedia && !file,
    });
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

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-taupe-200">
          {existingMedia
            ? t("postComposer.photoChange")
            : t("postComposer.photoOptional")}
        </span>

        {existingMedia ? (
          existingMedia.viewOnce ? (
            /* Éphémère : pas d'aperçu (la lecture le consommerait). */
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-charcoal-600/60 bg-charcoal-800 px-3 py-2">
              <span className="text-xs text-taupe-300">
                {t("postComposer.ephemeralAttached")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemoveMedia(true)}
              >
                {t("postComposer.remove")}
              </Button>
            </div>
          ) : (
            /* Média normal : aperçu flouté révélé au press-hold (loader authentifié). */
            <div className="space-y-2">
              <SafeMedia
                loader={existingMedia.loader}
                kind={existingMedia.kind}
                alt={existingMedia.alt ?? t("postComposer.attachedAlt")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemoveMedia(true)}
              >
                {t("postComposer.removePhoto")}
              </Button>
            </div>
          )
        ) : null}

        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setRemoveMedia(false);
          }}
          className="block w-full text-xs text-taupe-300 file:mr-3 file:rounded-2xl file:border-0 file:bg-charcoal-700 file:px-3 file:py-2 file:text-xs file:text-taupe-100 hover:file:bg-charcoal-600"
        />

        {editing && removeMedia && !file && (
          <p className="text-[11px] text-taupe-400">
            {t("postComposer.willRemove")}{" "}
            <button
              type="button"
              onClick={() => setRemoveMedia(false)}
              className="underline underline-offset-2 hover:text-taupe-200"
            >
              {t("postComposer.undo")}
            </button>
          </p>
        )}
      </div>

      {preview && (
        <div className="space-y-3">
          <SafeMedia
            src={preview}
            kind={file ? fileKind(file) : "image"}
            alt={t("postComposer.previewAlt")}
            viewOnce={viewOnce}
          />
          <Toggle
            checked={viewOnce}
            onChange={setViewOnce}
            label={t("postComposer.ephemeralToggle")}
            hint={t("postComposer.ephemeralHint")}
          />
        </div>
      )}

      <div className="space-y-2 pt-1">
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={!canSubmit}>
            {editingPublished
              ? t("postComposer.saveEdits")
              : t("postComposer.publish")}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
        {!editingPublished && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!canSubmit}
            onClick={() => submit(true)}
          >
            {t("postComposer.saveDraft")}
          </Button>
        )}
      </div>
    </form>
  );
}
