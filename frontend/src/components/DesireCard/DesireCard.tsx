import { useTranslation } from "react-i18next";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { cn } from "../../lib/cn";

export interface DesireCardProps {
  /** Libellé de l'envie (résolu par l'appelant via i18n). */
  label: string;
  /** Petit indice optionnel sous le libellé. */
  description?: string;
  /** J'ai coché cette envie (mon intérêt privé). */
  interested: boolean;
  /** Réciprocité : l'autre l'a cochée aussi → révélé (#99). */
  matched: boolean;
  /** Bascule mon intérêt. */
  onToggle?: () => void;
  className?: string;
}

/**
 * Une envie du « Dossier Noir » (#99) : carte entièrement cliquable qui bascule
 * mon intérêt. Trois états — neutre (cœur creux), coché (cœur plein, liseré
 * spice) et **matché** (braise + badge « Match ! ») quand l'autre l'a cochée
 * aussi. Tant qu'il n'y a pas réciprocité, rien ne trahit le choix de l'autre.
 */
export function DesireCard({
  label,
  description,
  interested,
  matched,
  onToggle,
  className,
}: DesireCardProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={interested}
      aria-label={
        interested ? t("desires.removeInterestAria") : t("desires.interestAria")
      }
      className={cn(
        "relative w-full overflow-hidden rounded-3xl border p-4 text-left shadow-felt transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
        matched
          ? "border-bordeaux-600 bg-bordeaux-700 bg-felt-velvet text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
          : interested
            ? "border-spice-500/70 bg-charcoal-800 bg-felt-linen text-blush-100"
            : "border-charcoal-600/60 bg-charcoal-800 bg-felt-linen text-taupe-200 hover:border-spice-400/40 hover:text-blush-100",
        className,
      )}
    >
      {matched && <FireEmbers count={6} />}
      <div className="relative z-10 flex items-center gap-3">
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
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base">{label}</p>
          {description && (
            <p
              className={cn(
                "text-xs",
                matched ? "text-blush-200/80" : "text-taupe-300",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {matched && (
          <span className="shrink-0 rounded-full border border-spice-400/70 bg-charcoal-900/40 px-2.5 py-1 text-xs font-medium text-blush-100">
            {t("desires.matchBadge")}
          </span>
        )}
      </div>
    </button>
  );
}
