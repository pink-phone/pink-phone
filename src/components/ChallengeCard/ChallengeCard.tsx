import { Surface } from "../Surface/Surface";
import { Badge, type BadgeTone } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { cn } from "../../lib/cn";
import {
  INTENSITY_LABEL,
  STATUS_META,
  type ChallengeStatus,
  type Intensity,
} from "./challenge";

const INTENSITY_TONE: Record<Intensity, BadgeTone> = {
  soft: "soft",
  hot: "hot",
  hard: "hard",
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
  /** Suppression du défi (réservée au proposeur ; affichée si `perspective` = "proposer"). */
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
  onDelete,
  className,
}: ChallengeCardProps) {
  const meta = STATUS_META[status];
  // Défi "chaud" (hot/hard) encore en jeu : halo de braise + particules.
  const showEmber = (intensity === "hot" || intensity === "hard") && status !== "jobDone";

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
          <Badge tone={INTENSITY_TONE[intensity]}>{INTENSITY_LABEL[intensity]}</Badge>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[status]}>{meta.label}</Badge>
            {perspective === "proposer" && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Supprimer ce défi"
                className="rounded-full px-1.5 py-0.5 text-base text-taupe-400 transition-colors duration-300 ease-felt hover:text-bordeaux-300"
              >
                🗑
              </button>
            )}
          </div>
        </div>

        <h3 className="font-serif text-xl text-blush-100">{title}</h3>
        <p className="text-sm leading-relaxed text-taupe-200">{description}</p>

        <div className="flex items-center justify-between text-xs text-taupe-400">
          <span>{meta.hint}</span>
          {deadlineLabel && <span>⏳ {deadlineLabel}</span>}
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
  if (status === "jobDone") return null;

  if (status === "proposed") {
    // Le destinataire répond ; l'auteur attend simplement (l'état "En attente
    // de réponse…" est déjà rendu via le hint du statut, plus haut sur la carte).
    if (perspective === "proposer") return null;
    return (
      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" className="flex-1" onClick={onAccept}>
          🔥 Challenge accepted
        </Button>
        <Button variant="ghost" size="sm" onClick={onNegotiate}>
          Maybe, maybe…
        </Button>
      </div>
    );
  }

  if (status === "maybeMaybe") {
    return (
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onAccept}>
          Finalement, partant·e
        </Button>
      </div>
    );
  }

  // challengeAccepted : la validation finale demande l'accord des deux.
  return (
    <div className="pt-1">
      <Button variant="primary" size="sm" className="w-full" onClick={onComplete}>
        ✅ Job done
      </Button>
    </div>
  );
}
