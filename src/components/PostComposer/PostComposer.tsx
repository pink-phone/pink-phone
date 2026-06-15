import { useEffect, useState } from "react";
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
    media?: { viewOnce: boolean; loader?: () => Promise<string>; alt?: string };
  };
}

/** Formulaire de rédaction d'un post du blog intime. */
export function PostComposer({ onSubmit, onCancel, initial }: PostComposerProps) {
  const editing = initial !== undefined;
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
        label="Titre (optionnel)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Cette idée qui me trotte…"
      />
      <TextArea
        label="Ton récit"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Raconte, à tête reposée…"
        rows={editing ? 14 : 5}
      />

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-taupe-200">
          {existingMedia ? "Photo (changer)" : "Photo (optionnel)"}
        </span>

        {existingMedia ? (
          existingMedia.viewOnce ? (
            /* Éphémère : pas d'aperçu (la lecture le consommerait). */
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-charcoal-600/60 bg-charcoal-800 px-3 py-2">
              <span className="text-xs text-taupe-300">
                ✦ Photo éphémère déjà jointe
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemoveMedia(true)}
              >
                Retirer
              </Button>
            </div>
          ) : (
            /* Média normal : aperçu flouté révélé au press-hold (loader authentifié). */
            <div className="space-y-2">
              <SafeMedia
                loader={existingMedia.loader}
                alt={existingMedia.alt ?? "Photo jointe"}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemoveMedia(true)}
              >
                Retirer la photo
              </Button>
            </div>
          )
        ) : null}

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setRemoveMedia(false);
          }}
          className="block w-full text-xs text-taupe-300 file:mr-3 file:rounded-2xl file:border-0 file:bg-charcoal-700 file:px-3 file:py-2 file:text-xs file:text-taupe-100 hover:file:bg-charcoal-600"
        />

        {editing && removeMedia && !file && (
          <p className="text-[11px] text-taupe-400">
            La photo sera retirée à l'enregistrement.{" "}
            <button
              type="button"
              onClick={() => setRemoveMedia(false)}
              className="underline underline-offset-2 hover:text-taupe-200"
            >
              Annuler
            </button>
          </p>
        )}
      </div>

      {preview && (
        <div className="space-y-3">
          <SafeMedia src={preview} alt="Aperçu" viewOnce={viewOnce} />
          <Toggle
            checked={viewOnce}
            onChange={setViewOnce}
            label="Éphémère (view once)"
            hint="La photo disparaît après une seule lecture."
          />
        </div>
      )}

      <div className="space-y-2 pt-1">
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={!canSubmit}>
            Publier
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={!canSubmit}
          onClick={() => submit(true)}
        >
          {editing ? "Enregistrer les modifications" : "Enregistrer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
