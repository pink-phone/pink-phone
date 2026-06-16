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
}

export interface PostComposerProps {
  onSubmit: (draft: PostDraft) => void;
  onCancel?: () => void;
}

/** Formulaire de rédaction d'un post du blog intime. */
export function PostComposer({ onSubmit, onCancel }: PostComposerProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

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

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim() || undefined,
      body: body.trim(),
      file: file ?? undefined,
      viewOnce: file ? viewOnce : false,
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
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
        rows={5}
      />

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-taupe-200">
          Photo (optionnel)
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-taupe-300 file:mr-3 file:rounded-2xl file:border-0 file:bg-charcoal-700 file:px-3 file:py-2 file:text-xs file:text-taupe-100 hover:file:bg-charcoal-600"
        />
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

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={!canSubmit}>
          Publier
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
