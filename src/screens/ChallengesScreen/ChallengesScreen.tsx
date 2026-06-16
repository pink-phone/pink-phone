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
}

// Ordre et titres des sections (la liste "En cours" vit en haut).
const SECTIONS: { status: ChallengeStatus; title: string }[] = [
  { status: "challengeAccepted", title: "En cours" },
  { status: "proposed", title: "Propositions" },
  { status: "maybeMaybe", title: "À adapter" },
  { status: "jobDone", title: "Accomplis" },
];

/** La liste des défis, regroupés par état. */
export function ChallengesScreen({
  challenges,
  onNew,
  onAccept,
  onNegotiate,
  onComplete,
}: ChallengesScreenProps) {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="font-serif text-2xl text-blush-100">Nos défis</h1>
        <Button size="sm" onClick={onNew}>
          ＋ Lancer un défi
        </Button>
      </header>

      {SECTIONS.map(({ status, title }) => {
        const items = challenges.filter((c) => c.status === status);
        if (items.length === 0) return null;
        return (
          <section key={status} className="space-y-3">
            <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
              {title}
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
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
