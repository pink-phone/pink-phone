import { useMemo, useState } from "react";
import { TextField } from "../form/TextField";
import { TextArea } from "../form/TextArea";
import { IntensityPicker } from "../form/IntensityPicker";
import { Button } from "../Button/Button";
import { Badge } from "../Badge/Badge";
import {
  CHALLENGE_PRESETS,
  INTENSITY_LABEL,
  type ChallengePreset,
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
  /** Banque de propositions (depuis l'API). À défaut, presets statiques. */
  suggestions?: ChallengePreset[];
}

const INTENSITY_TONE = { soft: "soft", hot: "hot", hard: "hard" } as const;
// Nombre d'inspirations affichées d'un coup (le reste via "Autres idées").
const VISIBLE_SUGGESTIONS = 5;

/** Formulaire de proposition d'un défi (depuis la banque ou sur-mesure). */
export function ChallengeComposer({
  onSubmit,
  onCancel,
  suggestions,
}: ChallengeComposerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("hot");
  const [deadline, setDeadline] = useState("");

  const bank = suggestions && suggestions.length > 0 ? suggestions : CHALLENGE_PRESETS;
  // Sous-ensemble aléatoire, re-tiré à chaque clic sur "Autres idées".
  const [round, setRound] = useState(0);
  const visibleSuggestions = useMemo(() => {
    if (bank.length <= VISIBLE_SUGGESTIONS) return bank;
    return [...bank].sort(() => Math.random() - 0.5).slice(0, VISIBLE_SUGGESTIONS);
    // round force un nouveau tirage ; bank, un nouveau contenu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, round]);
  const canReshuffle = bank.length > VISIBLE_SUGGESTIONS;

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
        <div className="flex items-center justify-between">
          <span className="block text-xs font-medium text-taupe-200">
            Inspiration (la banque)
          </span>
          {canReshuffle && (
            <button
              type="button"
              onClick={() => setRound((r) => r + 1)}
              className="text-xs text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            >
              🎲 Autres idées
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleSuggestions.map((p) => (
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
