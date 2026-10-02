import { useTranslation } from "react-i18next";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { MenuMark, type MenuMarkState } from "../MenuMark/MenuMark";
import { cn } from "../../lib/cn";

export interface EveningMenuEntryProps {
  label: string;
  /** Description courte du catalogue. */
  description?: string;
  /** Repère de sous-catégorie (ex. « Kamasutra »). */
  subcategoryLabel?: string;
  /** J'ai coché ce soir (privé en mode aveugle, visible en mode ouvert). */
  picked: boolean;
  /** Sur le menu ce soir → révélé (#97b). */
  matched: boolean;
  /** Mode ouvert (#0040) : le/la partenaire a proposé cet item aujourd'hui. */
  partnerWants?: boolean;
  /** Mode ouvert : refusé (par moi ou le/la partenaire). */
  refused?: boolean;
  /** Mode ouvert : affiche « En attente de … » sur mes choix pas encore validés
   *  par l'autre. Sans effet en mode aveugle (pas d'attente dans le rituel). */
  openMode?: boolean;
  /** Prénom du/de la partenaire pour les lignes de statut. */
  partnerName?: string;
  /** Proposition de l'autre : « Partant·e » (pose mon propre choix → match). */
  onAccept?: () => void;
  /** Proposition de l'autre : « Pas ce soir ». Présent ⇒ bouton affiché. */
  onRefuse?: () => void;
  /** Mon choix : bouton ✕ « Retirer ». */
  onRemove?: () => void;
  className?: string;
}

/** Un seul statut visuel par item, dans l'ordre de priorité : une proposition
 *  de l'autre que je n'ai pas encore validée passe avant « matché » (en mode
 *  ouvert elle est déjà révélée sur le menu sans que j'aie répondu). */
export function entryState(p: {
  picked: boolean;
  matched: boolean;
  partnerWants?: boolean;
  refused?: boolean;
}): MenuMarkState {
  if (p.refused) return "refused";
  if (p.partnerWants && !p.picked) return "proposed";
  if (p.matched && p.picked) return "match";
  if (p.picked) return "mine";
  return "empty";
}

/**
 * Un item du menu du soir (#97b, #0039, 114c), en ligne pleine largeur : marque
 * d'état (`MenuMark`) + libellé + ligne de statut en texte. Le corps n'est plus
 * cliquable : chaque geste a son bouton, nommé et de 44 px — ✕ « Retirer » sur
 * mon choix ; « Partant·e » / « Pas ce soir » (même poids visuel) sur une
 * proposition de l'autre. Match : braise + halo, seul signal qui « respire ».
 */
export function EveningMenuEntry({
  label,
  description,
  subcategoryLabel,
  picked,
  matched,
  partnerWants = false,
  refused = false,
  openMode = false,
  partnerName,
  onAccept,
  onRefuse,
  onRemove,
  className,
}: EveningMenuEntryProps) {
  const { t } = useTranslation();
  const state = entryState({ picked, matched, partnerWants, refused });
  const name = partnerName ?? t("eveningMenu.partner");

  const status =
    state === "proposed"
      ? t("eveningMenu.partnerWants", { name })
      : state === "match"
        ? t("eveningMenu.matchStatus")
        : state === "mine" && openMode
          ? t("eveningMenu.waitingFor", { name })
          : state === "refused"
            ? t("eveningMenu.refusedBadge")
            : undefined;

  const showAnswer = state === "proposed" && Boolean(onAccept || onRefuse);
  const canRemove = picked && !refused && Boolean(onRemove);

  return (
    <div
      role="listitem"
      className={cn(
        "relative overflow-hidden rounded-2xl border shadow-felt transition-all duration-300 ease-felt",
        state === "refused"
          ? "border-charcoal-600/60 bg-charcoal-800 text-taupe-400"
          : state === "match"
            ? "border-bordeaux-600 bg-bordeaux-700 bg-felt-velvet text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
            : state === "mine"
              ? "border-spice-500/70 bg-charcoal-800 bg-felt-linen text-blush-100"
              : state === "proposed"
                ? "border-dashed border-spice-400/70 bg-charcoal-800 bg-felt-linen text-taupe-100"
                : "border-charcoal-600/60 bg-charcoal-800 bg-felt-linen text-taupe-200",
        className,
      )}
    >
      {state === "match" && <FireEmbers count={6} />}
      <div className="relative z-10 flex items-stretch">
        <div className="flex min-w-0 flex-1 items-center gap-3 p-4">
          <MenuMark state={state} />
          <div className="min-w-0 flex-1">
            {subcategoryLabel && (
              <span
                className={cn(
                  "block text-[10px] uppercase tracking-wide",
                  state === "match" ? "text-blush-100/60" : "text-taupe-300",
                )}
              >
                {subcategoryLabel}
              </span>
            )}
            <span
              className={cn(
                "block font-serif text-base",
                state === "refused" && "line-through decoration-taupe-400/60",
              )}
            >
              {label}
            </span>
            {description && state !== "refused" && (
              <span
                className={cn(
                  "mt-0.5 block text-xs",
                  state === "match" ? "text-blush-100/70" : "text-taupe-300",
                )}
              >
                {description}
              </span>
            )}
            {status && (
              <span
                className={cn(
                  "mt-1 block text-[11px]",
                  state === "match" ? "text-blush-100/80" : "text-taupe-300",
                )}
              >
                {status}
              </span>
            )}
          </div>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("eveningMenu.removeAria", { label })}
            className="flex min-h-11 w-11 shrink-0 items-center justify-center text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spice-500"
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>

      {showAnswer && (
        <div className="relative z-10 flex gap-2 border-t border-charcoal-600/60 p-2">
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              aria-label={t("eveningMenu.acceptAria", { label })}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-spice-600 px-3 text-sm font-medium text-blush-50 shadow-glow transition-all duration-300 ease-felt hover:bg-spice-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blush-100"
            >
              <span aria-hidden>✓</span>
              {t("eveningMenu.accept")}
            </button>
          )}
          {onRefuse && (
            <button
              type="button"
              onClick={onRefuse}
              aria-label={t("eveningMenu.refuseAria", { label })}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-charcoal-600 px-3 text-sm text-taupe-200 transition-colors duration-300 ease-felt hover:border-taupe-400 hover:text-blush-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-spice-500"
            >
              <span aria-hidden>⊘</span>
              {t("eveningMenu.refuse")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
