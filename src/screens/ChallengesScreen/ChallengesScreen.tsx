import { useTranslation } from "react-i18next";
import { ChallengeCard } from "../../components/ChallengeCard/ChallengeCard";
import { Button } from "../../components/Button/Button";
import type { ChallengeStatus } from "../../components/ChallengeCard/challenge";
import type { ChallengeData } from "../../mock/data";

export interface ChallengesScreenProps {
  challenges: ChallengeData[];
  onNew?: () => void;
  onAccept?: (id: string) => void;
  onNegotiate?: (id: string) => void;
  onComplete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

// Ordre des sections (la liste "En cours" vit en haut). Titres via i18n.
const SECTION_ORDER: ChallengeStatus[] = [
  "challengeAccepted",
  "proposed",
  "maybeMaybe",
  "jobDone",
];

/** La liste des défis, regroupés par état. */
export function ChallengesScreen({
  challenges,
  onNew,
  onAccept,
  onNegotiate,
  onComplete,
  onEdit,
  onDelete,
}: ChallengesScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="font-serif text-2xl text-blush-100">
          {t("challenges.title")}
        </h1>
        <Button size="sm" onClick={onNew}>
          {t("challenges.new")}
        </Button>
      </header>

      {SECTION_ORDER.map((status) => {
        const items = challenges.filter((c) => c.status === status);
        if (items.length === 0) return null;
        return (
          <section key={status} className="space-y-3">
            <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
              {t(`challenges.sections.${status}`)}
            </h2>
            <div className="flex flex-col items-stretch gap-3">
              {items.map((c) => (
                <ChallengeCard
                  key={c.id}
                  title={c.title}
                  description={c.description}
                  intensity={c.intensity}
                  status={c.status}
                  deadlineLabel={c.deadlineLabel}
                  perspective={c.perspective}
                  className="max-w-none"
                  onAccept={() => onAccept?.(c.id)}
                  onNegotiate={() => onNegotiate?.(c.id)}
                  onComplete={() => onComplete?.(c.id)}
                  onEdit={() => onEdit?.(c.id)}
                  onDelete={() => onDelete?.(c.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
