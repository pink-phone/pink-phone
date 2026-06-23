import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ChallengeCard } from "../../components/ChallengeCard/ChallengeCard";
import { Button } from "../../components/Button/Button";
import { UnreadDivider } from "../../components/UnreadDivider/UnreadDivider";
import type { ChallengeStatus } from "../../components/ChallengeCard/challenge";
import type { ChallengeData } from "../../types/view";

export interface ChallengesScreenProps {
  challenges: ChallengeData[];
  onNew?: () => void;
  onOpenBank?: () => void;
  onAccept?: (id: string) => void;
  onNegotiate?: (id: string) => void;
  onComplete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Reste-t-il des défis plus anciens à charger ? (pagination par curseur) */
  hasMore?: boolean;
  /** Chargement de la page suivante en cours. */
  loadingMore?: boolean;
  onLoadMore?: () => void;
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
  onOpenBank,
  onAccept,
  onNegotiate,
  onComplete,
  onEdit,
  onDelete,
  hasMore,
  loadingMore,
  onLoadMore,
}: ChallengesScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="font-serif text-2xl text-blush-100">
          {t("challenges.title")}
        </h1>
        <div className="flex items-center gap-2">
          {onOpenBank && (
            <Button variant="secondary" size="sm" onClick={onOpenBank}>
              {t("challenges.bank")}
            </Button>
          )}
          <Button size="sm" onClick={onNew}>
            {t("challenges.new")}
          </Button>
        </div>
      </header>

      {challenges.length === 0 && (
        <p className="py-12 text-center text-sm text-taupe-300">
          {t("challenges.empty")}
        </p>
      )}

      {SECTION_ORDER.map((status) => {
        const items = challenges.filter((c) => c.status === status);
        if (items.length === 0) return null;
        // Ligne « non lus » uniquement dans les Propositions reçues (les
        // nouveautés), posée sous le dernier défi non lu de la section.
        let lastUnread = -1;
        if (status === "proposed") {
          items.forEach((c, i) => {
            if (c.unread) lastUnread = i;
          });
        }
        return (
          <section key={status} className="space-y-3">
            <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
              {t(`challenges.sections.${status}`)}
            </h2>
            <div className="flex flex-col items-stretch gap-3">
              {items.map((c, i) => (
                <Fragment key={c.id}>
                  <ChallengeCard
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
                  {i === lastUnread && (
                    <UnreadDivider label={t("common.unread")} />
                  )}
                </Fragment>
              ))}
            </div>
          </section>
        );
      })}

      {hasMore && (
        <div className="flex">
          <Button
            variant="secondary"
            size="sm"
            className="mx-auto"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? t("common.loading") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
