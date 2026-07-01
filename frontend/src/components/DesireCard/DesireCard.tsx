import { useTranslation } from "react-i18next";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { cn } from "../../lib/cn";

export interface DesireCardProps {
  /** Libellé de l'envie (résolu par l'appelant via i18n). */
  label: string;
  /** J'ai marqué « envie » (privé, double-aveugle). */
  interested: boolean;
  /** J'ai marqué « contre » (ma limite). */
  against?: boolean;
  /** Réciprocité d'envie → révélé (#99). */
  matched: boolean;
  /** Limite du couple (quelqu'un est contre) — surfacée, bloque le match. */
  limit?: boolean;
  /** Le couple l'a marquée « ✓ Réalisé » (partagé). */
  done?: boolean;
  /** Bascule mon « envie ». */
  onToggleWant?: () => void;
  /** Bascule mon « contre » (limite). Présent ⇒ affiche le bouton contre. */
  onToggleAgainst?: () => void;
  /** Bascule « ✓ Réalisé » (couple). Présent ⇒ affiche le bouton réalisé. */
  onToggleDone?: () => void;
  className?: string;
}

/**
 * Une envie de la bucket list (#99), à TROIS états perso (neutre / envie / contre)
 * + le partagé « réalisé ». « Envie » est double-aveugle (révélé en match) ; un
 * « contre » pose une **limite surfacée au couple** (badge, bloque le match).
 * Conteneur `div` + boutons côte à côte (pas de bouton imbriqué).
 */
export function DesireCard({
  label,
  interested,
  against = false,
  matched,
  limit = false,
  done = false,
  onToggleWant,
  onToggleAgainst,
  onToggleDone,
  className,
}: DesireCardProps) {
  const { t } = useTranslation();

  // Priorité visuelle : match > limite > envie > neutre.
  const wantIcon = matched
    ? "✨"
    : against
      ? "⊘"
      : interested
        ? "♥"
        : "♡";

  return (
    <div
      className={cn(
        "relative flex items-stretch overflow-hidden rounded-2xl border shadow-felt transition-all duration-300 ease-felt",
        matched
          ? "border-bordeaux-600 bg-bordeaux-700 bg-felt-velvet text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
          : limit
            ? "border-taupe-300/40 bg-charcoal-800 text-taupe-300"
            : interested
              ? "border-spice-500/70 bg-charcoal-800 bg-felt-linen text-blush-100"
              : "border-charcoal-600/60 bg-charcoal-800 bg-felt-linen text-taupe-200",
        className,
      )}
    >
      {matched && <FireEmbers count={6} />}

      <button
        type="button"
        onClick={onToggleWant}
        aria-pressed={interested}
        aria-label={
          interested ? t("desires.removeInterestAria") : t("desires.interestAria")
        }
        className="relative z-10 flex flex-1 items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spice-500"
      >
        <span
          aria-hidden
          className={cn(
            "text-2xl leading-none",
            matched
              ? "text-blush-100"
              : against
                ? "text-taupe-400"
                : interested
                  ? "text-spice-300"
                  : "text-taupe-400",
          )}
        >
          {wantIcon}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block font-serif text-base",
              limit && !matched && "line-through decoration-taupe-400/60",
            )}
          >
            {label}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {limit && !matched && (
              <span className="inline-block rounded-full border border-taupe-300/40 px-2 py-0.5 text-[11px] text-taupe-300">
                {t("desires.limitBadge")}
              </span>
            )}
            {done && (
              <span className="inline-block rounded-full bg-spice-500/20 px-2 py-0.5 text-[11px] text-spice-200">
                {t("desires.doneBadge")}
              </span>
            )}
          </span>
        </span>
        {matched && (
          <span className="shrink-0 rounded-full border border-spice-400/70 bg-charcoal-900/40 px-2.5 py-1 text-xs font-medium text-blush-100">
            {t("desires.matchBadge")}
          </span>
        )}
      </button>

      {onToggleAgainst && (
        <button
          type="button"
          onClick={onToggleAgainst}
          aria-pressed={against}
          aria-label={
            against ? t("desires.removeAgainstAria") : t("desires.againstAria")
          }
          className={cn(
            "relative z-10 flex w-12 shrink-0 items-center justify-center border-l text-lg transition-colors duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spice-500",
            matched ? "border-bordeaux-600/60" : "border-charcoal-600/60",
            against
              ? "bg-charcoal-900/50 text-taupe-100"
              : "text-taupe-400 hover:text-taupe-100",
          )}
        >
          <span aria-hidden>🚫</span>
        </button>
      )}

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
