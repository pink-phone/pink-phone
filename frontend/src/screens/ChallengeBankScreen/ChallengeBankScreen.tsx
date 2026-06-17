import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { Badge, type BadgeTone } from "../../components/Badge/Badge";
import {
  ChallengeBankManager,
  type BankSuggestion,
} from "../../components/ChallengeBankManager/ChallengeBankManager";
import type { Intensity } from "../../components/ChallengeCard/challenge";

export interface BankItem {
  id: string;
  title: string;
  description: string;
  intensity: Intensity;
  /** Proposition propre au salon (éditable) vs banque commune. */
  isOwn: boolean;
}

export interface ChallengeBankScreenProps {
  suggestions: BankItem[];
  onAdd: (s: { title: string; description: string; intensity: Intensity }) => void;
  onUpdate: (
    id: string,
    s: { title: string; description: string; intensity: Intensity },
  ) => void;
  onDelete: (id: string) => void;
  onBack?: () => void;
}

const INTENSITY_TONE: Record<Intensity, BadgeTone> = { soft: "soft", hot: "hot" };
const ORDER: Intensity[] = ["soft", "hot"];

/** Écran dédié : catalogue de toutes les propositions + gestion de celles du salon. */
export function ChallengeBankScreen({
  suggestions,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
}: ChallengeBankScreenProps) {
  const { t } = useTranslation();
  const own: BankSuggestion[] = suggestions
    .filter((s) => s.isOwn)
    .map(({ id, title, description, intensity }) => ({
      id,
      title,
      description,
      intensity,
    }));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="rounded-full px-2 py-1 text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ←
          </button>
        )}
        <h1 className="font-serif text-2xl text-blush-100">
          {t("challengeBank.title")}
        </h1>
      </header>

      {/* Catalogue : toutes les propositions, groupées par intensité. */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("challengeBank.catalogue")}
        </h2>
        {ORDER.map((intensity) => {
          const items = suggestions.filter((s) => s.intensity === intensity);
          if (items.length === 0) return null;
          return (
            <div key={intensity} className="space-y-2">
              <Badge tone={INTENSITY_TONE[intensity]}>
                {t(`challenges.intensity.${intensity}`)}
              </Badge>
              <ul className="space-y-2">
                {items.map((s) => (
                  <li key={s.id}>
                    <Surface tone="velvet" className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-serif text-sm text-blush-100">
                          {s.title}
                        </span>
                        {s.isOwn && (
                          <Badge tone="accent">{t("challengeBank.ownTag")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-taupe-300">{s.description}</p>
                    </Surface>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Gestion des propositions du salon. */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("challengeBank.mine")}
        </h2>
        <ChallengeBankManager
          suggestions={own}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      </section>
    </div>
  );
}
