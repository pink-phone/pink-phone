import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ApiEveningMenuItem } from "../../api/types";

export interface EveningMenuProps {
  /** Items du menu de ce soir (code/picked/matched) — déjà chargés. */
  items: ApiEveningMenuItem[];
  /** Bascule mon choix du soir (par code). */
  onToggle?: (code: string) => void;
  className?: string;
}

// Code stable → clé i18n typée du libellé. Mêmes 10 codes que la const Rust
// `EVENING_MENU_CODES` (source de vérité ; #97b). Code inconnu → ignoré.
const LABEL_KEYS = {
  cuddle: "eveningMenu.items.cuddle",
  movie: "eveningMenu.items.movie",
  candlelight: "eveningMenu.items.candlelight",
  bath: "eveningMenu.items.bath",
  massage: "eveningMenu.items.massage",
  slowDance: "eveningMenu.items.slowDance",
  game: "eveningMenu.items.game",
  roleplay: "eveningMenu.items.roleplay",
  newThing: "eveningMenu.items.newThing",
  passionate: "eveningMenu.items.passionate",
} as const;

/**
 * « Menu du soir » (#97b) : grille compacte de puces qu'on coche en secret pour
 * ce soir. Un item « matché » (les deux l'ont coché aujourd'hui) s'illumine
 * (braise + ✨). Rituel quotidien — remis à zéro à minuit côté serveur.
 */
export function EveningMenu({ items, onToggle, className }: EveningMenuProps) {
  const { t } = useTranslation();
  const known = items.filter(
    (i): i is ApiEveningMenuItem & { code: keyof typeof LABEL_KEYS } =>
      i.code in LABEL_KEYS,
  );
  const matchCount = known.filter((i) => i.matched).length;

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-taupe-100">
          {t("eveningMenu.title")}
        </h2>
        {matchCount > 0 && (
          <span className="rounded-full border border-spice-500/70 bg-bordeaux-700 px-2.5 py-0.5 text-xs text-blush-100 shadow-glow">
            {t("eveningMenu.matchCount", { count: matchCount })}
          </span>
        )}
      </div>
      <p className="text-xs text-taupe-400">{t("eveningMenu.intro")}</p>
      <div className="flex flex-wrap gap-2">
        {known.map((i) => (
          <button
            key={i.code}
            type="button"
            onClick={() => onToggle?.(i.code)}
            aria-pressed={i.picked}
            aria-label={
              i.picked
                ? t("eveningMenu.removeAria")
                : t("eveningMenu.pickAria")
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              i.matched
                ? "border-bordeaux-600 bg-bordeaux-700 bg-felt-velvet text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
                : i.picked
                  ? "border-spice-500/70 bg-charcoal-800 text-blush-100"
                  : "border-charcoal-600/60 bg-charcoal-800 text-taupe-200 hover:border-spice-400/40 hover:text-blush-100",
            )}
          >
            <span aria-hidden>
              {i.matched ? "✨" : i.picked ? "♥" : "♡"}
            </span>
            {t(LABEL_KEYS[i.code])}
          </button>
        ))}
      </div>
    </section>
  );
}
