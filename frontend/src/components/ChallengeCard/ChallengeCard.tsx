import { useTranslation } from "react-i18next";
import { Surface } from "../Surface/Surface";
import { Badge, type BadgeTone } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { ContextMenu } from "../ContextMenu/ContextMenu";
import { cn } from "../../lib/cn";
import { type ChallengeStatus, type Intensity } from "./challenge";

const INTENSITY_TONE: Record<Intensity, BadgeTone> = {
  soft: "soft",
  hot: "hot",
};

const STATUS_TONE: Record<ChallengeStatus, BadgeTone> = {
  proposed: "neutral",
  challengeAccepted: "accent",
  maybeMaybe: "hot",
  jobDone: "soft",
};

export interface ChallengeCardProps {
  title: string;
  description: string;
  intensity: Intensity;
  status: ChallengeStatus;
  /** Déjà formaté (ex: "Avant dimanche"). Optionnel. */
  deadlineLabel?: string;
  /**
   * Côté de l'utilisateur courant. Le destinataire peut accepter/négocier ;
   * la validation finale ("Job done") demande l'accord des deux.
   */
  perspective?: "recipient" | "proposer";
  onAccept?: () => void;
  onNegotiate?: () => void;
  onComplete?: () => void;
  /** Modifier / supprimer le défi (réservés au proposeur via le menu « ⋯ »). */
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

/** Carte d'un défi, avec ses actions selon l'état courant. */
export function ChallengeCard({
  title,
  description,
  intensity,
  status,
  deadlineLabel,
  perspective = "recipient",
  onAccept,
  onNegotiate,
  onComplete,
  onEdit,
  onDelete,
  className,
}: ChallengeCardProps) {
  const { t } = useTranslation();
  // Défi "chaud" (hot/hard) encore en jeu : halo de braise + particules.
  const showEmber = intensity === "hot" && status !== "jobDone";

  return (
    <Surface
      tone={status === "jobDone" ? "deep" : "velvet"}
      className={cn(
        "relative w-full overflow-hidden",
        showEmber && "shadow-ember animate-ember-breathe motion-reduce:animate-none",
        className,
      )}
    >
      {showEmber && <FireEmbers count={7} />}
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={INTENSITY_TONE[intensity]}>
            {t(`challenges.intensity.${intensity}`)}
          </Badge>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[status]}>
              {t(`challenges.status.${status}.label`)}
            </Badge>
            {perspective === "proposer" && (onEdit || onDelete) && (
              <ContextMenu
                ariaLabel={t("common.actions")}
                items={[
                  ...(onEdit
                    ? [{ label: t("common.edit"), onClick: onEdit }]
                    : []),
                  ...(onDelete
                    ? [
                        {
                          label: t("common.delete"),
                          onClick: onDelete,
                          danger: true,
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </div>
        </div>

        <h3 className="font-serif text-xl text-blush-100">{title}</h3>
        <p className="text-sm leading-relaxed text-taupe-200">{description}</p>

        <div className="flex items-center justify-between text-xs text-taupe-400">
          <span>{t(`challenges.status.${status}.hint`)}</span>
          {deadlineLabel && (
            <span>{t("challenges.deadline", { label: deadlineLabel })}</span>
          )}
        </div>

        <Actions
          status={status}
          perspective={perspective}
          onAccept={onAccept}
          onNegotiate={onNegotiate}
          onComplete={onComplete}
        />
      </div>
    </Surface>
  );
}

function Actions({
  status,
  perspective,
  onAccept,
  onNegotiate,
  onComplete,
}: Pick<
  ChallengeCardProps,
  "status" | "perspective" | "onAccept" | "onNegotiate" | "onComplete"
>) {
  const { t } = useTranslation();
  if (status === "jobDone") return null;

  if (status === "proposed") {
    // Le destinataire répond ; l'auteur attend simplement (l'état "En attente
    // de réponse…" est déjà rendu via le hint du statut, plus haut sur la carte).
    if (perspective === "proposer") return null;
    return (
      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" className="flex-1" onClick={onAccept}>
          {t("challenges.action.accept")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onNegotiate}>
          {t("challenges.action.negotiate")}
        </Button>
      </div>
    );
  }

  if (status === "maybeMaybe") {
    // Répondre reste la prérogative du destinataire (cf. garde backend SEC-015) :
    // le proposeur attend, il ne s'auto-accepte pas le défi.
    if (perspective === "proposer") return null;
    return (
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onAccept}>
          {t("challenges.action.maybeAccept")}
        </Button>
      </div>
    );
  }

  // challengeAccepted : la validation finale demande l'accord des deux.
  return (
    <div className="pt-1">
      <Button variant="primary" size="sm" className="w-full" onClick={onComplete}>
        {t("challenges.action.done")}
      </Button>
    </div>
  );
}
