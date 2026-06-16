import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // Rose Épicé — action principale
  primary:
    "bg-spice-500 text-blush-50 shadow-felt-sm hover:bg-spice-400 active:bg-spice-600",
  // Surface feutrée discrète
  secondary:
    "bg-charcoal-700 text-taupe-200 border border-charcoal-600/70 hover:border-spice-400/50 hover:text-blush-100",
  // Sans fond, pour les actions secondaires ("pas cette fois")
  ghost: "text-taupe-300 hover:text-blush-100 hover:bg-charcoal-700/60",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Bouton feutré : arrondi généreux, transitions lentes, glow au focus. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-2xl font-medium",
        "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
