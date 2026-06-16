import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../form/TextField";
import { TextArea } from "../form/TextArea";
import { IntensityPicker } from "../form/IntensityPicker";
import { Button } from "../Button/Button";
import { Badge, type BadgeTone } from "../Badge/Badge";
import { Surface } from "../Surface/Surface";
import type { Intensity } from "../ChallengeCard/challenge";

export interface BankSuggestion {
  id: string;
  title: string;
  description: string;
  intensity: Intensity;
}

export interface ChallengeBankManagerProps {
  /** Propositions propres au salon (éditables). */
  suggestions: BankSuggestion[];
  onAdd: (s: { title: string; description: string; intensity: Intensity }) => void;
  onUpdate: (
    id: string,
    s: { title: string; description: string; intensity: Intensity },
  ) => void;
  onDelete: (id: string) => void;
}

const INTENSITY_TONE: Record<Intensity, BadgeTone> = {
  soft: "soft",
  hot: "hot",
  hard: "hard",
};

/** Gestion de la banque de défis propre au salon : ajout, édition, suppression. */
export function ChallengeBankManager({
  suggestions,
  onAdd,
  onUpdate,
  onDelete,
}: ChallengeBankManagerProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("hot");

  const reset = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setIntensity("hot");
  };

  const startEdit = (s: BankSuggestion) => {
    setEditingId(s.id);
    setTitle(s.title);
    setDescription(s.description);
    setIntensity(s.intensity);
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    const payload = {
      title: title.trim(),
      description: description.trim(),
      intensity,
    };
    if (editingId) onUpdate(editingId, payload);
    else onAdd(payload);
    reset();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-taupe-400">{t("challengeBank.intro")}</p>

      {suggestions.length === 0 ? (
        <p className="text-sm text-taupe-400">{t("challengeBank.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 rounded-2xl bg-charcoal-900/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={INTENSITY_TONE[s.intensity]}>
                    {t(`challenges.intensity.${s.intensity}`)}
                  </Badge>
                  <span className="truncate font-serif text-sm text-blush-100">
                    {s.title}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-taupe-300">
                  {s.description}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  aria-label={t("challengeBank.edit")}
                  className="rounded-full px-1.5 py-0.5 text-sm text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={t("challengeBank.delete")}
                  className="rounded-full px-1.5 py-0.5 text-sm text-taupe-400 transition-colors duration-300 ease-felt hover:text-bordeaux-300"
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Formulaire d'ajout / édition */}
      <Surface tone="velvet" className="space-y-3">
        <TextField
          label={t("challengeComposer.titleLabel")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("challengeComposer.titlePlaceholder")}
        />
        <TextArea
          label={t("challengeComposer.descriptionLabel")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("challengeComposer.descriptionPlaceholder")}
          rows={2}
        />
        <IntensityPicker value={intensity} onChange={setIntensity} />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={!canSubmit}
            onClick={submit}
          >
            {editingId ? t("settings.save") : t("challengeBank.add")}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </Surface>
    </div>
  );
}
