import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import type { ReactionId } from "../../domain/types";

// Réactions rapides prédéfinies "sans jugement". Une réaction peut aussi être
// un emoji libre — d'où le type `string` pour les valeurs aux frontières.
// `ReactionId` (l'ensemble connu) est un type de domaine, re-exporté ici.
export type { ReactionId };

export interface ReactionOption {
  id: ReactionId;
  emoji: string;
}

export const REACTIONS: ReactionOption[] = [
  { id: "heart", emoji: "❤️" },
  { id: "fire", emoji: "🔥" },
  { id: "smirk", emoji: "😏" },
  { id: "breath", emoji: "😮‍💨" },
  { id: "hush", emoji: "🤫" },
];

const PREDEFINED = new Set<string>(REACTIONS.map((r) => r.id));
const PREDEFINED_EMOJI: Record<string, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.id, r.emoji]),
);

export interface ReactionBarProps {
  /** Compteurs par réaction (clé = id prédéfini ou emoji libre). */
  counts?: Record<string, number>;
  /** Réactions déjà posées par l'utilisateur courant (état actif). */
  mine?: string[];
  onToggle?: (reaction: string) => void;
  /** Réactions prédéfinies actives, dans l'ordre voulu (défaut : toutes). */
  order?: ReactionId[];
  /** Autoriser une réaction emoji libre (bouton « + »). */
  allowCustom?: boolean;
  className?: string;
}

/** Barre de réactions emoji : un appui pose/retire sa réaction, « + » pour un emoji libre. */
export function ReactionBar({
  counts = {},
  mine = [],
  onToggle,
  order,
  allowCustom = true,
  className,
}: ReactionBarProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");

  // Réactions prédéfinies actives (ordre du salon, sinon toutes).
  const enabled = order ?? REACTIONS.map((r) => r.id);

  // Réactions custom déjà présentes (posées par l'un ou l'autre), hors prédéfinies.
  const customPresent = [...new Set([...Object.keys(counts), ...mine])].filter(
    (r) => !PREDEFINED.has(r),
  );

  // Liste rendue : prédéfinies actives (dans l'ordre) + custom présentes.
  const items: { key: string; emoji: string; label: string; hot: boolean }[] = [
    ...enabled.map((id) => ({
      key: id,
      emoji: PREDEFINED_EMOJI[id] ?? id,
      label: t(`reactions.${id}`),
      hot: id === "fire",
    })),
    ...customPresent.map((e) => ({
      key: e,
      emoji: PREDEFINED_EMOJI[e] ?? e,
      label: e,
      hot: false,
    })),
  ];

  const submitCustom = () => {
    const value = custom.trim();
    setCustom("");
    setAdding(false);
    if (value) onToggle?.(value);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map(({ key, emoji, label, hot }) => {
        const active = mine.includes(key);
        const count = counts[key] ?? 0;
        // Réaction posée par quelqu'un d'autre (présente mais pas de moi) :
        // liseré spice pour la repérer d'un coup d'œil sans la confondre avec la mienne.
        const byOther = !active && count > 0;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={byOther ? t("reactions.byOtherAria", { label }) : label}
            onClick={() => onToggle?.(key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1 text-sm",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              active
                ? hot
                  ? "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
                  : "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow"
                : byOther
                  ? "border-spice-400/70 bg-charcoal-800 text-taupe-100 hover:-translate-y-0.5"
                  : "border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/40 hover:-translate-y-0.5",
            )}
          >
            {active && hot && <FireEmbers count={4} />}
            <span className="relative z-10 text-base leading-none">{emoji}</span>
            {count > 0 && (
              <span className="relative z-10 text-xs tabular-nums text-taupe-300">
                {count}
              </span>
            )}
          </button>
        );
      })}

      {allowCustom &&
        (adding ? (
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              submitCustom();
            }}
          >
            <input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={submitCustom}
              maxLength={16}
              aria-label={t("reactions.addAria")}
              placeholder={t("reactions.addPlaceholder")}
              className="w-16 rounded-full border border-spice-400/50 bg-charcoal-800 px-3 py-1 text-center text-base text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={t("reactions.addAria")}
            // Cercle visible de 32px, mais la cible tactile est portée à 44px via
            // un overlay invisible (`before:`) — accessibilité (UI-A11Y3) sans
            // grossir le bouton dans la rangée compacte de réactions.
            className="group relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-charcoal-600/60 bg-charcoal-800 transition-all duration-300 ease-felt before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:border-spice-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            {/* Smiley grisé + badge « ＋ » : affordance « ajouter une réaction ». */}
            <span className="relative inline-flex text-base opacity-50 grayscale transition-all duration-300 ease-felt group-hover:opacity-100 group-hover:grayscale-0">
              🙂
              <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-charcoal-700 text-[8px] font-semibold leading-none text-taupe-100 ring-1 ring-charcoal-600">
                ＋
              </span>
            </span>
          </button>
        ))}
    </div>
  );
}
