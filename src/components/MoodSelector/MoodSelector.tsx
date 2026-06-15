import { cn } from "../../lib/cn";
import { FireEmbers } from "../FireEmbers/FireEmbers";
import { MOODS, type MoodId } from "./moods";

export interface MoodSelectorProps {
  /** Mood actuellement sélectionné (contrôlé). */
  value?: MoodId | null;
  /** Déclenché au choix d'un mood. */
  onChange?: (mood: MoodId) => void;
  className?: string;
}

/**
 * Sélecteur de "Mood" (météo sexuelle) : une rangée d'états d'esprit.
 * L'état actif reçoit un soft glow plutôt qu'une couleur plate (DA "felted").
 * Permet de lancer une perche sans un mot.
 */
export function MoodSelector({ value, onChange, className }: MoodSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Mon humeur du moment"
      className={cn("flex justify-center gap-2", className)}
    >
      {MOODS.map((mood) => {
        const active = value === mood.id;
        const hot = mood.id === "veryHot";
        return (
          <button
            key={mood.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={mood.label}
            onClick={() => onChange?.(mood.id)}
            className={cn(
              "group relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 rounded-2xl border px-1 py-3",
              "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
              active
                ? hot
                  ? "border-spice-500/70 bg-bordeaux-700 bg-felt-velvet shadow-ember animate-ember-breathe motion-reduce:animate-none"
                  : "border-spice-500/70 bg-bordeaux-700 bg-felt-velvet shadow-glow"
                : "border-charcoal-600/50 bg-charcoal-800 shadow-felt-sm hover:border-spice-400/50 hover:-translate-y-0.5",
            )}
          >
            {active && hot && <FireEmbers count={5} />}
            <span
              className={cn(
                "relative z-10 text-2xl transition-transform duration-300 ease-felt",
                active ? "scale-110" : "opacity-80 group-hover:opacity-100",
              )}
            >
              {mood.emoji}
            </span>
            <span
              className={cn(
                "relative z-10 text-center text-[11px] leading-tight",
                active ? "text-blush-100" : "text-taupe-300",
              )}
            >
              {mood.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
