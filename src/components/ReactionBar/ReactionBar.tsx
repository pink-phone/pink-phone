import { cn } from "../../lib/cn";
import { FireEmbers } from "../FireEmbers/FireEmbers";

// Réactions rapides "sans jugement". Miroir d'un enum backend possible.
export type ReactionId = "fire" | "smirk" | "breath" | "hush";

export interface ReactionOption {
  id: ReactionId;
  emoji: string;
  label: string;
}

export const REACTIONS: ReactionOption[] = [
  { id: "fire", emoji: "🔥", label: "Chaud" },
  { id: "smirk", emoji: "😏", label: "Coquin" },
  { id: "breath", emoji: "😮‍💨", label: "Haletant" },
  { id: "hush", emoji: "🤫", label: "Notre secret" },
];

export interface ReactionBarProps {
  /** Compteurs par réaction. */
  counts?: Partial<Record<ReactionId, number>>;
  /** Réactions déjà posées par l'utilisateur courant (état actif). */
  mine?: ReactionId[];
  onToggle?: (reaction: ReactionId) => void;
  className?: string;
}

/** Barre de réactions emoji : un appui pose/retire sa réaction. */
export function ReactionBar({
  counts = {},
  mine = [],
  onToggle,
  className,
}: ReactionBarProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {REACTIONS.map((r) => {
        const active = mine.includes(r.id);
        const count = counts[r.id] ?? 0;
        const hot = r.id === "fire";
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={active}
            aria-label={r.label}
            onClick={() => onToggle?.(r.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1 text-sm",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              active
                ? hot
                  ? "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-ember animate-ember-breathe motion-reduce:animate-none"
                  : "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow"
                : "border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/40 hover:-translate-y-0.5",
            )}
          >
            {active && hot && <FireEmbers count={4} />}
            <span className="relative z-10 text-base leading-none">{r.emoji}</span>
            {count > 0 && (
              <span className="relative z-10 text-xs tabular-nums text-taupe-300">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
