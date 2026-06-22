import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { Badge, type BadgeTone } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import { Sheet } from "../../components/Sheet/Sheet";
import { TextField } from "../../components/form/TextField";
import { TextArea } from "../../components/form/TextArea";
import { IntensityPicker } from "../../components/form/IntensityPicker";
import type { Intensity } from "../../components/ChallengeCard/challenge";

export interface BankItem {
  id: string;
  title: string;
  description: string;
  intensity: Intensity;
  /** Proposition propre au salon (éditable) vs banque commune. */
  isOwn: boolean;
}

type SuggestionDraft = {
  title: string;
  description: string;
  intensity: Intensity;
};

export interface ChallengeBankScreenProps {
  suggestions: BankItem[];
  /** Proposer ce défi au/à la partenaire (crée un défi « proposed », #62). */
  onPropose: (s: SuggestionDraft) => void;
  onAdd: (s: SuggestionDraft) => void;
  onUpdate: (id: string, s: SuggestionDraft) => void;
  onDelete: (id: string) => void;
  onBack?: () => void;
}

const INTENSITY_TONE: Record<Intensity, BadgeTone> = { soft: "soft", hot: "hot" };
const ORDER: Intensity[] = ["soft", "hot"];

/** Écran dédié : catalogue des propositions, chacune proposable / éditable au clic. */
export function ChallengeBankScreen({
  suggestions,
  onPropose,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
}: ChallengeBankScreenProps) {
  const { t } = useTranslation();

  // Formulaire d'ajout / édition (Sheet). `editingId` null = ajout.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("hot");

  const openAdd = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setIntensity("hot");
    setFormOpen(true);
  };
  const openEdit = (s: BankItem) => {
    setEditingId(s.id);
    setTitle(s.title);
    setDescription(s.description);
    setIntensity(s.intensity);
    setFormOpen(true);
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
    setFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ←
          </button>
        )}
        <h1 className="flex-1 font-serif text-2xl text-blush-100">
          {t("challengeBank.title")}
        </h1>
        <Button size="sm" onClick={openAdd}>
          {t("challengeBank.add")}
        </Button>
      </header>

      <p className="text-xs text-taupe-300">{t("challengeBank.intro")}</p>

      {ORDER.map((tone) => {
        const items = suggestions.filter((s) => s.intensity === tone);
        if (items.length === 0) return null;
        return (
          <section key={tone} className="space-y-2">
            <Badge tone={INTENSITY_TONE[tone]}>
              {t(`challenges.intensity.${tone}`)}
            </Badge>
            <ul className="space-y-2">
              {items.map((s) => (
                <li key={s.id}>
                  <Surface tone="velvet" className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 font-serif text-sm text-blush-100">
                        {s.title}
                      </span>
                      {s.isOwn && (
                        <Badge tone="accent">{t("challengeBank.ownTag")}</Badge>
                      )}
                      <ContextMenu
                        ariaLabel={t("common.actions")}
                        items={[
                          {
                            label: t("challengeBank.propose"),
                            onClick: () =>
                              onPropose({
                                title: s.title,
                                description: s.description,
                                intensity: s.intensity,
                              }),
                          },
                          ...(s.isOwn
                            ? [
                                { label: t("common.edit"), onClick: () => openEdit(s) },
                                {
                                  label: t("common.delete"),
                                  onClick: () => onDelete(s.id),
                                  danger: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                    <p className="text-xs text-taupe-300">{s.description}</p>
                  </Surface>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Sheet
        open={formOpen}
        title={
          editingId ? t("challengeBank.editTitle") : t("challengeBank.addTitle")
        }
        onClose={() => setFormOpen(false)}
      >
        <div className="space-y-3">
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
            rows={3}
          />
          <IntensityPicker value={intensity} onChange={setIntensity} />
          <Button className="w-full" disabled={!canSubmit} onClick={submit}>
            {editingId ? t("common.save") : t("challengeBank.add")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
