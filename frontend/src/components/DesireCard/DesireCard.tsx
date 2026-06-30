import { useTranslation } from "react-i18next";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { cn } from "../../lib/cn";

export interface DesireCardProps {
  /** Libellé de l'envie (résolu par l'appelant via i18n). */
  label: string;
  /** J'ai coché cette envie (mon intérêt privé). */
  interested: boolean;
  /** Réciprocité : l'autre l'a cochée aussi → révélé (#99). */
  matched: boolean;
  /** Le couple l'a marquée « ✓ Réalisé » (suivi bucket list, partagé). */
  done?: boolean;
  /** Bascule mon intérêt (privé). */
  onToggle?: () => void;
  /** Bascule « ✓ Réalisé » (couple). Présent ⇒ affiche le bouton réalisé. */
  onToggleDone?: () => void;
  className?: string;
}

/**
 * Une envie de la bucket list (#99). La carte porte DEUX actions distinctes :
 * un grand bouton « intérêt » (privé, double-aveugle : neutre/coché/matché) et un
 * petit bouton « ✓ Réalisé » (partagé, niveau couple). Pas de bouton imbriqué :
 * conteneur `div` + deux `button` côte à côte.
 */
export function DesireCard({
  label,
  interested,
  matched,
  done = false,
  onToggle,
  onToggleDone,
  className,
}: DesireCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "relative flex items-stretch overflow-hidden rounded-3xl border shadow-felt transition-all duration-300 ease-felt",
        matched
          ? "border-bordeaux-600 bg-bordeaux-700 bg-felt-velvet text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
          : interested
            ? "border-spice-500/70 bg-charcoal-800 bg-felt-linen text-blush-100"
            : "border-charcoal-600/60 bg-charcoal-800 bg-felt-linen text-taupe-200",
        className,
      )}
    >
      {matched && <FireEmbers count={6} />}

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={interested}
        aria-label={
          interested
            ? t("desires.removeInterestAria")
            : t("desires.interestAria")
        }
        className="relative z-10 flex flex-1 items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spice-500"
      >
        <span
          aria-hidden
          className={cn(
            "text-2xl leading-none",
            matched
              ? "text-blush-100"
              : interested
                ? "text-spice-300"
                : "text-taupe-400",
          )}
        >
          {matched ? "✨" : interested ? "♥" : "♡"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-base">{label}</span>
          {done && (
            <span className="mt-0.5 inline-block rounded-full bg-spice-500/20 px-2 py-0.5 text-[11px] text-spice-200">
              {t("desires.doneBadge")}
            </span>
          )}
        </span>
        {matched && (
          <span className="shrink-0 rounded-full border border-spice-400/70 bg-charcoal-900/40 px-2.5 py-1 text-xs font-medium text-blush-100">
            {t("desires.matchBadge")}
          </span>
        )}
      </button>

      {onToggleDone && (
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={done ? t("desires.undoneAria") : t("desires.doneAria")}
          className={cn(
            "relative z-10 flex w-12 shrink-0 items-center justify-center border-l text-lg transition-colors duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spice-500",
            matched ? "border-bordeaux-600/60" : "border-charcoal-600/60",
            done ? "text-spice-300" : "text-taupe-400 hover:text-spice-300",
          )}
        >
          <span aria-hidden>{done ? "✓" : "○"}</span>
        </button>
      )}
    </div>
  );
}
