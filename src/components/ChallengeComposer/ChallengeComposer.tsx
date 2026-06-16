import { useState } from "react";
import { TextField } from "../form/TextField";
import { TextArea } from "../form/TextArea";
import { IntensityPicker } from "../form/IntensityPicker";
import { Button } from "../Button/Button";
import { Badge } from "../Badge/Badge";
import {
  CHALLENGE_PRESETS,
  INTENSITY_LABEL,
  type Intensity,
} from "../ChallengeCard/challenge";

export interface ChallengeDraft {
  title: string;
  description: string;
  intensity: Intensity;
  deadlineLabel?: string;
}

export interface ChallengeComposerProps {
  onSubmit: (draft: ChallengeDraft) => void;
  onCancel?: () => void;
}

const INTENSITY_TONE = { soft: "soft", hot: "hot", hard: "hard" } as const;

/** Formulaire de proposition d'un défi (depuis la banque ou sur-mesure). */
export function ChallengeComposer({ onSubmit, onCancel }: ChallengeComposerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("hot");
  const [deadline, setDeadline] = useState("");

  const canSubmit = title.trim().length > 0 && description.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      intensity,
      deadlineLabel: deadline.trim() || undefined,
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
      {/* La "banque" : remplir d'un geste */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-taupe-200">
          Inspiration (la banque)
        </span>
        <div className="flex flex-wrap gap-2">
          {CHALLENGE_PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => {
                setTitle(p.title);
                setDescription(p.description);
                setIntensity(p.intensity);
              }}
              className="rounded-full transition-transform duration-300 ease-felt hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            >
              <Badge tone={INTENSITY_TONE[p.intensity]}>{p.title}</Badge>
            </button>
          ))}
        </div>
      </div>

      <TextField
        label="Titre du défi"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Un massage aux huiles…"
      />
      <TextArea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Ce que tu proposes, et comment."
        rows={4}
      />
      <IntensityPicker value={intensity} onChange={setIntensity} />
      <TextField
        label="Date limite (optionnel)"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        placeholder="Avant dimanche"
      />

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={!canSubmit}>
          🔥 Proposer ({INTENSITY_LABEL[intensity]})
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
