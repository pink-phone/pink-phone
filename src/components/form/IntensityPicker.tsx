import { cn } from "../../lib/cn";
import { INTENSITY_LABEL, type Intensity } from "../ChallengeCard/challenge";

const ORDER: Intensity[] = ["soft", "hot", "hard"];

const ACTIVE: Record<Intensity, string> = {
  soft: "border-taupe-300/50 bg-charcoal-700 text-taupe-100",
  hot: "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow",
  hard: "border-bordeaux-500/70 bg-bordeaux-600 text-blush-100 shadow-glow",
};

export interface IntensityPickerProps {
  value: Intensity;
  onChange: (intensity: Intensity) => void;
  label?: string;
  className?: string;
}

/** Sélecteur segmenté de l'intensité d'un défi (Soft / Hot / Hard). */
export function IntensityPicker({
  value,
  onChange,
  label = "Intensité",
  className,
}: IntensityPickerProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="block text-xs font-medium text-taupe-200">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {ORDER.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(id)}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2 text-xs font-medium",
                "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
                active
                  ? ACTIVE[id]
                  : "border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/40",
              )}
            >
              {INTENSITY_LABEL[id]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
