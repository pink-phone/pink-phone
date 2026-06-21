import { cn } from "../../lib/cn";
import type { Verdict } from "../../domain/types";

// L'évaluation discrète d'un fantasme/défi (type de domaine, re-exporté ici).
export type { Verdict };

interface VerdictOption {
  id: Verdict;
  emoji: string;
  label: string;
  activeClass: string;
}

const OPTIONS: VerdictOption[] = [
  {
    id: "hot",
    emoji: "🔥",
    label: "Chaud·e",
    activeClass: "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow",
  },
  {
    id: "curious",
    emoji: "🤔",
    label: "Curieux·se",
    activeClass: "border-spice-400/60 bg-charcoal-700 text-blush-100",
  },
  {
    id: "notForMe",
    emoji: "🙅",
    label: "Pas mon truc",
    activeClass: "border-taupe-300/40 bg-charcoal-700 text-taupe-200",
  },
];

export interface VerdictPickerProps {
  value?: Verdict | null;
  onChange?: (verdict: Verdict) => void;
  className?: string;
}

/** Trois boutons discrets pour se positionner sans avoir à écrire. */
export function VerdictPicker({ value, onChange, className }: VerdictPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Mon ressenti"
      className={cn("flex gap-2", className)}
    >
      {OPTIONS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange?.(o.id)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              active
                ? o.activeClass
                : "border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/40",
            )}
          >
            <span className="text-sm leading-none">{o.emoji}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
