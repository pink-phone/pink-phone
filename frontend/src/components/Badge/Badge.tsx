import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "soft" | "hot" | "hard" | "neutral" | "accent";

const TONES: Record<BadgeTone, string> = {
  // Intensités des défis
  soft: "bg-taupe-200/15 text-taupe-200 border-taupe-300/30",
  hot: "bg-spice-500/20 text-spice-300 border-spice-400/40",
  hard: "bg-bordeaux-600/30 text-blush-200 border-bordeaux-500/60",
  // Usage générique
  neutral: "bg-charcoal-700 text-taupe-300 border-charcoal-600/70",
  accent: "bg-spice-500 text-blush-50 border-transparent",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Petit point/emoji décoratif en tête. */
  icon?: ReactNode;
  className?: string;
}

/** Pastille arrondie : intensité d'un défi, statut, étiquette. */
export function Badge({ children, tone = "neutral", icon, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
