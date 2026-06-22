import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // Rose Épicé — action principale. Défaut spice-600 (contraste AA ~5.3:1 avec
  // blush-50 ; spice-500 échouait à 3.95:1 — UI-A11Y2), éclairci au survol.
  primary:
    "bg-spice-600 text-blush-50 shadow-felt-sm hover:bg-spice-500 active:bg-spice-600",
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
  /** Action asynchrone en cours : spinner + bouton désactivé (anti double-envoi). */
  loading?: boolean;
}

/** Bouton feutré : arrondi généreux, transitions lentes, glow au focus. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-2xl font-medium",
        "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg
          className="h-3.5 w-3.5 shrink-0 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
